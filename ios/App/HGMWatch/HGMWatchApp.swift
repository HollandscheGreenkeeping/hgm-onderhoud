import SwiftUI

// Apple Watch-app van HGM Onderhoud: werk van vandaag afvinken en open storingen oppakken.
// Inloggen gebeurt op de iPhone; die geeft het horloge een eigen sessie (zie Verbinding.swift).
@main
struct HGMWatchApp: App {
    @StateObject private var verbinding = Verbinding()

    var body: some Scene {
        WindowGroup {
            HoofdScherm().environmentObject(verbinding)
        }
    }
}
