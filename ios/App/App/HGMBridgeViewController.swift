import Capacitor

// Eigen bridge-controller zodat de app-eigen plugins (HorlogePlugin) geregistreerd worden.
// Main.storyboard verwijst hiernaar in plaats van naar CAPBridgeViewController.
class HGMBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HorlogePlugin())
    }
}
