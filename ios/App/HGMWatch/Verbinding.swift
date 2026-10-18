import Foundation
import Security
import WatchConnectivity

// Sessie die de iPhone-app doorgeeft (een eigen sessie voor het horloge, zie de Edge Function
// 'horloge'). Het horloge ververst hem zelf via de Supabase Auth-API.
struct Sessie: Codable {
    var url: String
    var sleutel: String          // publieke Supabase-sleutel
    var toegang: String          // access token (JWT)
    var verversen: String        // refresh token
    var verloopt: Double         // unix-tijd
    var gebruiker: String        // profiel-id
    var naam: String
}

// Keychain: de sessie blijft bewaard, ook na herstarten van het horloge.
enum Kluis {
    private static let sleutel = "nl.hgmgolf.onderhoud.sessie"
    private static var vraag: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: sleutel]
    }
    static func lees() -> Sessie? {
        var q = vraag
        q[kSecReturnData as String] = true
        var data: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &data) == errSecSuccess, let d = data as? Data else { return nil }
        return try? JSONDecoder().decode(Sessie.self, from: d)
    }
    static func bewaar(_ s: Sessie) {
        wis()
        var q = vraag
        q[kSecValueData as String] = try? JSONEncoder().encode(s)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(q as CFDictionary, nil)
    }
    static func wis() { SecItemDelete(vraag as CFDictionary) }
}

enum VerbindingsFout: LocalizedError {
    case nietGekoppeld, server(String)
    var errorDescription: String? {
        switch self {
        case .nietGekoppeld: return "Open HGM Onderhoud op je iPhone om het horloge te koppelen."
        case .server(let t): return t
        }
    }
}

@MainActor
final class Verbinding: NSObject, ObservableObject, WCSessionDelegate {
    @Published var gekoppeld = false
    @Published var naam = ""
    @Published var banen: [Baan] = []
    @Published var baanId: String? {
        didSet { UserDefaults.standard.set(baanId, forKey: "baan") }
    }

    private var sessie: Sessie?
    var gebruiker: String { sessie?.gebruiker ?? "" }

    override init() {
        super.init()
        sessie = Kluis.lees()
        gekoppeld = sessie != nil
        naam = sessie?.naam ?? ""
        baanId = UserDefaults.standard.string(forKey: "baan")
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
        if gekoppeld { Task { await laadBanen() } }
    }

    // ── Koppelen via de iPhone ──

    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        let context = session.receivedApplicationContext
        if !context.isEmpty { Task { @MainActor in self.verwerk(context) } }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        Task { @MainActor in self.verwerk(context) }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        if let context = message["sessie"] as? [String: Any] { Task { @MainActor in self.verwerk(context) } }
    }

    private func verwerk(_ c: [String: Any]) {
        if c["uitgelogd"] != nil { return ontkoppel() }
        guard let url = c["url"] as? String, let sleutel = c["sleutel"] as? String,
              let toegang = c["access_token"] as? String, let verversen = c["refresh_token"] as? String else { return }
        let s = Sessie(url: url, sleutel: sleutel, toegang: toegang, verversen: verversen,
                       verloopt: c["verloopt"] as? Double ?? 0, gebruiker: c["gebruiker"] as? String ?? "",
                       naam: c["naam"] as? String ?? "")
        sessie = s
        Kluis.bewaar(s)
        naam = s.naam
        gekoppeld = true
        Task { await laadBanen() }
    }

    // Vraagt de iPhone om opnieuw te koppelen (werkt als de iPhone-app open staat).
    func vraagKoppeling() {
        guard WCSession.default.activationState == .activated, WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(["koppelVerzoek": true], replyHandler: nil)
    }

    func ontkoppel() {
        Kluis.wis()
        sessie = nil
        gekoppeld = false
        banen = []
    }

    // ── Sessie verversen ──

    private func geldigToken() async throws -> String {
        guard var s = sessie else { throw VerbindingsFout.nietGekoppeld }
        if s.verloopt - Date().timeIntervalSince1970 > 60 { return s.toegang }
        var verzoek = URLRequest(url: URL(string: "\(s.url)/auth/v1/token?grant_type=refresh_token")!)
        verzoek.httpMethod = "POST"
        verzoek.setValue(s.sleutel, forHTTPHeaderField: "apikey")
        verzoek.setValue("application/json", forHTTPHeaderField: "Content-Type")
        verzoek.httpBody = try JSONSerialization.data(withJSONObject: ["refresh_token": s.verversen])
        let (data, antwoord) = try await URLSession.shared.data(for: verzoek)
        guard (antwoord as? HTTPURLResponse)?.statusCode == 200,
              let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let toegang = json["access_token"] as? String, let verversen = json["refresh_token"] as? String else {
            // Sessie ingetrokken of verlopen: opnieuw koppelen via de iPhone.
            ontkoppel()
            vraagKoppeling()
            throw VerbindingsFout.nietGekoppeld
        }
        s.toegang = toegang
        s.verversen = verversen
        s.verloopt = json["expires_at"] as? Double ?? (Date().timeIntervalSince1970 + 3600)
        sessie = s
        Kluis.bewaar(s)
        return toegang
    }

    // ── REST-API (PostgREST); de RLS in de database bepaalt wat mag ──

    private func verzoek(_ pad: String, methode: String, body: Any? = nil) async throws -> Data {
        guard let s = sessie else { throw VerbindingsFout.nietGekoppeld }
        let token = try await geldigToken()
        var v = URLRequest(url: URL(string: "\(s.url)/rest/v1/\(pad)")!)
        v.httpMethod = methode
        v.setValue(s.sleutel, forHTTPHeaderField: "apikey")
        v.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        v.setValue("application/json", forHTTPHeaderField: "Content-Type")
        v.setValue("application/json", forHTTPHeaderField: "Accept")
        if methode == "PATCH" { v.setValue("return=representation", forHTTPHeaderField: "Prefer") }
        if let body { v.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, antwoord) = try await URLSession.shared.data(for: v)
        let code = (antwoord as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            let tekst = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["message"] as? String
            throw VerbindingsFout.server(tekst ?? "Opslaan mislukt (\(code)).")
        }
        // PATCH zonder rijen terug = RLS weigerde de wijziging.
        if methode == "PATCH", String(data: data, encoding: .utf8) == "[]" {
            throw VerbindingsFout.server("Dit mag je niet wijzigen.")
        }
        return data
    }

    func haal<T: Decodable>(_ pad: String, als: T.Type = T.self) async throws -> T {
        try JSONDecoder().decode(T.self, from: try await verzoek(pad, methode: "GET"))
    }

    func rpc<T: Decodable>(_ functie: String, _ argumenten: [String: Any] = [:], als: T.Type = T.self) async throws -> T {
        try JSONDecoder().decode(T.self, from: try await verzoek("rpc/\(functie)", methode: "POST", body: argumenten))
    }

    func wijzig(_ pad: String, _ velden: [String: Any]) async throws {
        _ = try await verzoek(pad, methode: "PATCH", body: velden)
    }

    func laadBanen() async {
        guard let alle = try? await rpc("mijn_locaties", als: [Baan].self) else { return }
        banen = alle.filter { $0.soort == "baan" }
        if baanId == nil || !banen.contains(where: { $0.id == baanId }) { baanId = banen.first?.id }
    }
}
