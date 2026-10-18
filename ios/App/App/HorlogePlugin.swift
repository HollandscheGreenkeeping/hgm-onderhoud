import Capacitor
import WatchConnectivity

// Brug tussen de iPhone-app en de Apple Watch (WatchConnectivity).
// JS (src/lib/horloge.ts): status(), stuurSessie({...}), ontkoppel().
// Het horloge vraagt om een (nieuwe) koppeling met het bericht "koppelVerzoek"; de app hoort dat
// als event 'koppelVerzoek' en koppelt opnieuw als hij open staat.
@objc(HorlogePlugin)
public class HorlogePlugin: CAPPlugin, CAPBridgedPlugin, WCSessionDelegate {
    public let identifier = "HorlogePlugin"
    public let jsName = "Horloge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stuurSessie", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ontkoppel", returnType: CAPPluginReturnPromise),
    ]

    // Context die klaarstaat tot WatchConnectivity geactiveerd is.
    private var wachtend: [String: Any]?
    // Statusvragen van vóór de activatie (isPaired is dan nog altijd false).
    private var statusVragen: [CAPPluginCall] = []

    override public func load() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    @objc func status(_ call: CAPPluginCall) {
        guard WCSession.isSupported() else { return call.resolve(["ondersteund": false, "gekoppeld": false, "geinstalleerd": false]) }
        let s = WCSession.default
        guard s.activationState == .activated else {
            call.keepAlive = true
            statusVragen.append(call)
            s.activate()
            return
        }
        beantwoord(call)
    }

    private func beantwoord(_ call: CAPPluginCall) {
        let s = WCSession.default
        call.resolve(["ondersteund": true, "gekoppeld": s.isPaired, "geinstalleerd": s.isWatchAppInstalled])
    }

    @objc func stuurSessie(_ call: CAPPluginCall) {
        guard let toegang = call.getString("access_token"), let verversen = call.getString("refresh_token"),
              let url = call.getString("url"), let sleutel = call.getString("sleutel") else {
            return call.reject("Sessie onvolledig")
        }
        let context: [String: Any] = [
            "access_token": toegang, "refresh_token": verversen, "verloopt": call.getDouble("expires_at") ?? 0,
            "url": url, "sleutel": sleutel, "gebruiker": call.getString("gebruiker") ?? "",
            "naam": call.getString("naam") ?? "", "verstuurd": Date().timeIntervalSince1970,
        ]
        verstuur(context, call)
    }

    private func verstuur(_ context: [String: Any], _ call: CAPPluginCall? = nil) {
        let s = WCSession.default
        guard s.activationState == .activated else {
            // Nog niet klaar: bewaren en versturen zodra de activatie rond is.
            wachtend = context
            s.activate()
            call?.resolve(["wachtend": true])
            return
        }
        do {
            try s.updateApplicationContext(context)
            // Staat de Watch-app open, dan meteen; anders komt de context binnen bij het openen.
            if s.isReachable { s.sendMessage(["sessie": context], replyHandler: nil, errorHandler: nil) }
            NSLog("[Horloge] sessie verstuurd (bereikbaar: \(s.isReachable), geinstalleerd: \(s.isWatchAppInstalled))")
            call?.resolve(["wachtend": false])
        } catch {
            NSLog("[Horloge] versturen mislukt: \(error.localizedDescription)")
            call?.reject("Versturen naar het horloge mislukt: \(error.localizedDescription)")
        }
    }

    @objc func ontkoppel(_ call: CAPPluginCall) {
        verstuur(["uitgelogd": true, "verstuurd": Date().timeIntervalSince1970])
        call.resolve()
    }

    // ── WCSessionDelegate ──
    public func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        NSLog("[Horloge] geactiveerd: \(state.rawValue), gekoppeld: \(session.isPaired), geinstalleerd: \(session.isWatchAppInstalled)")
        DispatchQueue.main.async {
            let vragen = self.statusVragen
            self.statusVragen = []
            vragen.forEach { self.beantwoord($0); $0.keepAlive = false }
            if state == .activated, let c = self.wachtend { self.wachtend = nil; self.verstuur(c) }
        }
    }
    public func sessionDidBecomeInactive(_ session: WCSession) {}
    public func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }

    public func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        if message["koppelVerzoek"] != nil { notifyListeners("koppelVerzoek", data: [:]) }
    }
}
