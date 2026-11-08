# Sourced by umbrelOS for this app, and for any app that declares
# rbitcoin-node as a dependency (umbrelOS sources an app's own exports plus
# those of its transitive dependencies). An app in another store cannot
# declare it, so those (Beignet among them) reach the node by the pinned
# container name below instead.
export APP_RBITCOIN_NODE_HOST="rbitcoin-node_node_1"
export APP_RBITCOIN_NODE_PORT="50001"
# The host port the compose file publishes Electrum on for the home network.
# 50001 (Electrs), 50002 (Fulcrum) and 50003 (ElectrumX) are taken by the
# official apps.
export APP_RBITCOIN_PUBLIC_PORT="50011"
