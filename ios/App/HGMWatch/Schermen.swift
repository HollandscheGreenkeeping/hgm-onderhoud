import SwiftUI

// Kleuren van huisstijl 2a (tokens.css), op een donker horloge-scherm.
extension Color {
    static let grasgroen = Color(red: 0x2f / 255, green: 0x7d / 255, blue: 0x3b / 255)
    static let storingRood = Color(red: 0xc8 / 255, green: 0x40 / 255, blue: 0x2f / 255)
    static let gepland = Color(red: 0xd9 / 255, green: 0x8a / 255, blue: 0x1e / 255)
}

struct HoofdScherm: View {
    @EnvironmentObject var verbinding: Verbinding

    var body: some View {
        if verbinding.gekoppeld {
            NavigationStack {
                TabView {
                    WerkScherm()
                    StoringenScherm()
                    InstellingenScherm()
                }
                .tabViewStyle(.verticalPage)
            }
        } else {
            KoppelScherm()
        }
    }
}

// ── Koppelen ─────────────────────────────────────────────────────────────

struct KoppelScherm: View {
    @EnvironmentObject var verbinding: Verbinding
    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Image(systemName: "iphone.and.arrow.forward").font(.title2).foregroundStyle(Color.grasgroen)
                Text("Koppel je horloge").font(.headline)
                Text("Open HGM Onderhoud op je iPhone en log in. Het horloge koppelt dan vanzelf.")
                    .font(.footnote).multilineTextAlignment(.center).foregroundStyle(.secondary)
                Button("Opnieuw proberen") { verbinding.vraagKoppeling() }.tint(.grasgroen)
            }
        }
    }
}

// ── Werk vandaag ─────────────────────────────────────────────────────────

struct WerkScherm: View {
    @EnvironmentObject var verbinding: Verbinding
    @State private var werk: [Werk] = []
    @State private var taken: [Taak] = []
    @State private var fout: String?
    @State private var laden = true

    var body: some View {
        List {
            if let fout { Text(fout).font(.footnote).foregroundStyle(Color.storingRood) }
            Section("Werk vandaag") {
                if !laden && werk.isEmpty { Text("Niets klaargezet.").foregroundStyle(.secondary) }
                ForEach(werk) { w in
                    Toggle(isOn: Binding(get: { w.uitgevoerd }, set: { nieuw in Task { await vink(w.id, nieuw) } })) {
                        VStack(alignment: .leading) {
                            Text(w.activiteit?.naam ?? "Werk").font(.headline)
                            if let n = w.notitie { Text(n).font(.caption2).foregroundStyle(.secondary) }
                        }
                    }
                    .tint(.grasgroen)
                }
            }
            Section("Mijn taken") {
                if !laden && taken.isEmpty { Text("Geen open taken.").foregroundStyle(.secondary) }
                ForEach(taken) { t in
                    NavigationLink { TaakScherm(taak: t) { await laad() } } label: {
                        VStack(alignment: .leading) {
                            Text(t.omschrijving).lineLimit(2)
                            if let d = t.deadline {
                                Text("uiterlijk \(korteDatum(d))").font(.caption2)
                                    .foregroundStyle(d < vandaag() ? Color.storingRood : .secondary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Vandaag")
        .task(id: verbinding.baanId) { await laad() }
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { Task { await laad() } } label: { Image(systemName: "arrow.clockwise") } } }
    }

    private func laad() async {
        guard let baan = verbinding.baanId else { return }
        laden = true
        defer { laden = false }
        do {
            async let w: [Werk] = verbinding.haal("werkzaamheden?select=id,uitgevoerd,notitie,activiteit:keuzelijst_waarden(naam)"
                + "&locatie_id=eq.\(baan)&medewerker_id=eq.\(verbinding.gebruiker)&datum=eq.\(vandaag())&order=volgorde")
            async let t: [Taak] = verbinding.haal("taken?select=id,omschrijving,status,deadline&locatie_id=eq.\(baan)"
                + "&toegewezen_aan=eq.\(verbinding.gebruiker)&status=in.(open,in_behandeling)&order=deadline.asc.nullslast")
            (werk, taken) = try await (w, t)
            fout = nil
        } catch { fout = error.localizedDescription }
    }

    private func vink(_ id: String, _ nieuw: Bool) async {
        if let i = werk.firstIndex(where: { $0.id == id }) { werk[i].uitgevoerd = nieuw }
        do { try await verbinding.wijzig("werkzaamheden?id=eq.\(id)", ["uitgevoerd": nieuw]) }
        catch { fout = error.localizedDescription; await laad() }
    }
}

struct TaakScherm: View {
    @EnvironmentObject var verbinding: Verbinding
    @Environment(\.dismiss) private var sluit
    let taak: Taak
    let klaar: () async -> Void
    @State private var fout: String?
    @State private var bezig = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text(taak.omschrijving).font(.headline)
                if let d = taak.deadline { Text("Uiterlijk \(korteDatum(d))").font(.footnote).foregroundStyle(.secondary) }
                if let fout { Text(fout).font(.footnote).foregroundStyle(Color.storingRood) }
                if taak.status == "open" {
                    Button("Ik ben bezig") { Task { await zet("in_behandeling") } }.disabled(bezig)
                }
                Button("Afgerond") { Task { await zet("afgerond") } }.tint(.grasgroen).disabled(bezig)
            }
        }
        .navigationTitle("Taak")
    }

    private func zet(_ status: String) async {
        bezig = true
        defer { bezig = false }
        do {
            try await verbinding.wijzig("taken?id=eq.\(taak.id)", ["status": status])
            await klaar()
            sluit()
        } catch { fout = error.localizedDescription }
    }
}

// ── Storingen ────────────────────────────────────────────────────────────

struct StoringenScherm: View {
    @EnvironmentObject var verbinding: Verbinding
    @State private var storingen: [Storing] = []
    @State private var fout: String?
    @State private var laden = true

    var body: some View {
        List {
            if let fout { Text(fout).font(.footnote).foregroundStyle(Color.storingRood) }
            if !laden && storingen.isEmpty { Text("Geen open storingen.").foregroundStyle(.secondary) }
            ForEach(storingen) { s in
                NavigationLink { StoringScherm(storing: s) { await laad() } } label: {
                    HStack(alignment: .top, spacing: 6) {
                        Circle().fill(s.urgentie == "spoed" || s.urgentie == "hoog" ? Color.storingRood : Color.gepland)
                            .frame(width: 8, height: 8).padding(.top, 6)
                        VStack(alignment: .leading) {
                            Text(s.titel).lineLimit(2)
                            Text(s.plek).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Storingen \(storingen.isEmpty ? "" : "(\(storingen.count))")")
        .task(id: verbinding.baanId) { await laad() }
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { Task { await laad() } } label: { Image(systemName: "arrow.clockwise") } } }
    }

    private func laad() async {
        guard let baan = verbinding.baanId else { return }
        laden = true
        defer { laden = false }
        do {
            storingen = try await verbinding.haal("storingen?select=id,status,urgentie,omschrijving,gemeld_op,toegewezen_aan,"
                + "type:keuzelijst_waarden(naam),object:objecten(code,objecttypes(naam),hole:holes(nummer))"
                + "&locatie_id=eq.\(baan)&status=in.(gemeld,toegewezen,in_behandeling)&order=urgentie.desc,gemeld_op.asc")
            fout = nil
        } catch { fout = error.localizedDescription }
    }
}

struct StoringScherm: View {
    @EnvironmentObject var verbinding: Verbinding
    @Environment(\.dismiss) private var sluit
    let storing: Storing
    let klaar: () async -> Void
    @State private var fout: String?
    @State private var bezig = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                Text(storing.code).font(.caption2.monospaced()).foregroundStyle(.secondary)
                Text(storing.titel).font(.headline)
                Text(storing.plek).font(.footnote)
                Text("\(urgentieNamen[storing.urgentie] ?? storing.urgentie) · \(storingStatus[storing.status] ?? storing.status)")
                    .font(.footnote).foregroundStyle(storing.urgentie == "spoed" ? Color.storingRood : .secondary)
                if let o = storing.omschrijving, o != storing.titel { Text(o).font(.footnote).foregroundStyle(.secondary) }
                if let fout { Text(fout).font(.footnote).foregroundStyle(Color.storingRood) }
                if storing.toegewezen_aan != verbinding.gebruiker || storing.status != "in_behandeling" {
                    Button("Ik pak dit op") { Task { await oppakken() } }.tint(.grasgroen).disabled(bezig)
                }
            }
        }
        .navigationTitle("Storing")
    }

    private func oppakken() async {
        bezig = true
        defer { bezig = false }
        do {
            try await verbinding.wijzig("storingen?id=eq.\(storing.id)",
                                        ["toegewezen_aan": verbinding.gebruiker, "status": "in_behandeling"])
            await klaar()
            sluit()
        } catch { fout = error.localizedDescription }
    }
}

// ── Instellingen ─────────────────────────────────────────────────────────

struct InstellingenScherm: View {
    @EnvironmentObject var verbinding: Verbinding
    var body: some View {
        List {
            Section("Baan") {
                if verbinding.banen.count > 1 {
                    Picker("Baan", selection: $verbinding.baanId) {
                        ForEach(verbinding.banen) { b in Text(b.naam).tag(Optional(b.id)) }
                    }
                } else {
                    Text(verbinding.banen.first?.naam ?? "Geen baan").foregroundStyle(.secondary)
                }
            }
            Section("Ingelogd als") {
                Text(verbinding.naam.isEmpty ? "Onbekend" : verbinding.naam)
                Button("Ontkoppelen", role: .destructive) { verbinding.ontkoppel() }
            }
        }
        .navigationTitle("HGM")
    }
}
q
