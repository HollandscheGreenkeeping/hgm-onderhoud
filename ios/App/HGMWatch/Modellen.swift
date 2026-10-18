import Foundation

// Gegevens zoals de REST-API ze teruggeeft (zelfde velden als de web-app).

struct Baan: Decodable, Identifiable, Hashable {
    let id: String
    let naam: String
    let rol: String?
    let soort: String
    enum CodingKeys: String, CodingKey { case id = "locatie_id", naam, rol, soort }
}

struct Naam: Decodable, Hashable { let naam: String? }

struct Werk: Decodable, Identifiable {
    let id: String
    var uitgevoerd: Bool
    let notitie: String?
    let activiteit: Naam?
}

struct Taak: Decodable, Identifiable {
    let id: String
    let omschrijving: String
    let status: String
    let deadline: String?
}

struct Hole: Decodable { let nummer: Int }
struct Objecttype: Decodable { let naam: String }
struct Object: Decodable {
    let code: String?
    let objecttypes: Objecttype?
    let hole: Hole?
}

struct Storing: Decodable, Identifiable {
    let id: String
    let status: String
    let urgentie: String
    let omschrijving: String?
    let gemeld_op: String
    let toegewezen_aan: String?
    let type: Naam?
    let object: Object?

    var titel: String { type?.naam ?? omschrijving.map { String($0.prefix(60)) } ?? "Storing" }
    var code: String { "S-\(id.prefix(4).uppercased())" }
    var plek: String {
        guard let o = object else { return "Plek op de kaart" }
        let delen = [o.objecttypes?.naam, o.code].compactMap { $0 }
        let tekst = delen.isEmpty ? "Object" : delen.joined(separator: " ")
        return o.hole.map { "\(tekst) · hole \($0.nummer)" } ?? tekst
    }
}

let urgentieNamen = ["laag": "Laag", "normaal": "Normaal", "hoog": "Hoog", "spoed": "Spoed"]
let storingStatus = ["gemeld": "Gemeld", "toegewezen": "Toegewezen", "in_behandeling": "In behandeling"]

// Vandaag als yyyy-MM-dd in de tijdzone van het horloge.
func vandaag() -> String {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: Date())
}

func korteDatum(_ iso: String?) -> String {
    guard let iso, iso.count >= 10 else { return "" }
    let delen = iso.prefix(10).split(separator: "-")
    return delen.count == 3 ? "\(Int(delen[2]) ?? 0)-\(Int(delen[1]) ?? 0)" : String(iso.prefix(10))
}
