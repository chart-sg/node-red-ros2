const { Ros2Instance } = require('../ros2/ros2-instance');

// RED argument provides the module access to Node-RED runtime api
module.exports = function(RED)
{
    var fs = require('fs');
    /*
     * @function SubscriberNode constructor
     * This node is defined by the constructor function SubscriberNode,
     * which is called when a new instance of the node is created
     *
     * @param {Object} config - Contains the properties set in the flow editor
     */
    function ServiceClientNode(config)
    {
        // Initialize the features shared by all nodes
        RED.nodes.createNode(this, config);
        this.props = config.props;
        var node = this;
        node.ready = false;

        // Get ros2-config
        if(config.ros2_config) {
            const ros2Config = RED.nodes.getNode(config.ros2_config);
            if (!ros2Config) {
                node.error("ros2-config is required but not found");
                return;
            }
            node.domain = ros2Config.domain || 0;
            node.namespace = ros2Config.namespace || '';
        } else {
            node.error("ros2-config is required");
            return;
        }

        // Check if topic is configured statically or dynamically
        if (config['topic']) {
            try {
                // Initialize service client asynchronously for static topic
                this.initializeServiceClient(config, node);
            }
            catch (error) {
                console.log("creating service client failed");
                console.log(error);
                node.ready = false;
                node.status({ fill: "red", shape: "dot", text: "error"});
            }
        } else {
            console.log("Dynamic service client - awaiting input with topic");
            node.ready = false;
            node.status({ fill: "yellow", shape: "dot", text: "awaiting topic" });
        }

        // Event emitted when the deploy is finished
        RED.events.once('flows:started', function() {
            if (node.ready) {
                node.status({ fill: "green", shape: "dot", text: "waiting to request service"});
            }
        });

        // Registers a listener to the input event,
        // which will be called whenever a message arrives at this node
        node.on('input', async function(msg) {
            // For dynamic service clients, handle topic creation/changes
            if (!config['topic']) {
                const topic = msg.topic;

                if (!topic) {
                    node.status({ fill: "red", shape: "dot", text: "missing topic in msg.topic" });
                    return;
                }

                try {
                    // Destroy existing client if topic changed
                    if ((node.serviceClientId || node.client) && node.currentTopic !== topic) {
                        if (node.usesSharedManager && node.serviceClientId) {
                            // Destroy via SharedManager
                            const ros2Bridge = require('@chart/node-red-ros2-manager');
                            const manager = ros2Bridge.getROS2Manager();
                            manager.destroyServiceClient(node.serviceClientId);
                            node.serviceClientId = null;
                            console.log("Previous service client destroyed via SharedManager for topic change");
                        } else if (node.client) {
                            // Destroy direct client
                            const ros2Node = await Ros2Instance.instance().getNode();
                            ros2Node.destroyClient(node.client);
                            node.client = null;
                            console.log("Previous service client destroyed for topic change");
                        }
                    }

                    // Create new client if needed
                    if (!node.serviceClientId && !node.client) {
                        const dynamicConfig = { ...config, topic: topic };
                        
                        await node.initializeServiceClient(dynamicConfig, node);
                        node.currentTopic = topic;
                        node.status({ fill: "green", shape: "dot", text: `ready on: ${topic}` });
                    }
                } catch (error) {
                    console.log("Error creating dynamic service client:", error);
                    node.status({ fill: "red", shape: "dot", text: "service client error" });
                    node.ready = false;
                    return;
                }
            }

            // Make service call (for both static and dynamic clients)
            if (node.ready && (node.serviceClientId || node.client)) {
                
                if (node.usesSharedManager && node.serviceClientId) {
                    // Use SharedManager for service call
                    try {
                        const ros2Bridge = require('@chart/node-red-ros2-manager');
                        const manager = ros2Bridge.getROS2Manager();
                        
                        // Check if service is available through SharedManager
                        const isAvailable = await manager.isServiceServerAvailable(node.serviceClientId);
                        if (!isAvailable) {
                            node.status({ fill: "yellow", shape: "dot", text: "service not available"});
                            return;
                        }

                        // service is available and ready
                        node.status({ fill: "green", shape: "dot", text: "request published"});

                        const response = await manager.callService(node.serviceClientId, msg.payload);
                        node.status({ fill: "green", shape: "dot", text: "response received"});
                        node.send({ payload: response });
                        
                    } catch (error) {
                        console.log("Error calling service via SharedManager:", error);
                        node.status({ fill: "red", shape: "dot", text: "service call error"});
                    }
                    
                } else if (node.client) {
                    // Use direct client approach
                    if (node.client.isServiceServerAvailable() == false) {
                        node.status({ fill: "yellow", shape: "dot", text: "service not available"});
                        return;
                    }

                    // service is available and ready
                    node.status({ fill: "green", shape: "dot", text: "request published"});

                    node.client.sendRequest(msg.payload, function(response) {
                        // Passes the message to the next node in the flow
                        node.status({ fill: "green", shape: "dot", text: "response received"});
                        node.send({ payload: response });
                    });
                }
            } else {
               console.log("node was not ready to process flow data");
            }
        });

        // Called when there is a re-deploy or the program is closed
        node.on('close', async function() {
            try {
                if (node.usesSharedManager && node.serviceClientId) {
                    // Destroy via SharedManager
                    const ros2Bridge = require('@chart/node-red-ros2-manager');
                    const manager = ros2Bridge.getROS2Manager();
                    manager.destroyServiceClient(node.serviceClientId);
                    node.serviceClientId = null;
                } else if (node.client) {
                    // Destroy direct client
                    const ros2Node = await Ros2Instance.instance().getNode();
                    ros2Node.destroyClient(node.client);
                    node.client = null;
                }
            } catch (error) {
                console.log("Error destroying service client:", error.message);
            }
            node.currentTopic = null;
            node.status({ fill: null, shape: null, text: ""});
        });
    }

    // Async method to initialize the service client
    ServiceClientNode.prototype.initializeServiceClient = async function(config, node) {
        try {
            // Get ROS2 instance (which uses SharedManager if available)
            const ros2Instance = Ros2Instance.instance();
            await ros2Instance.waitForReady();
            
            // Check if we're using the bridge (SharedManager)
            if (ros2Instance.usesBridge) {
                console.log("[ServiceClient] Using SharedManager approach for service client");
                
                // Get the bridge manager
                const ros2Bridge = require('@chart/node-red-ros2-manager');
                const manager = ros2Bridge.getROS2Manager();
                
                // Create service client through SharedManager
                node.serviceClientId = await manager.createServiceClient(
                    ros2Instance.nodeId,
                    config['selectedtype'],
                    config['topic']
                );
                
                node.usesSharedManager = true;
                console.log("[ServiceClient] Service client created via SharedManager:", node.serviceClientId);
                
            } else {
                console.log("[ServiceClient] Using direct approach for service client (standalone mode)");
                
                // Fallback to direct service client creation (for standalone use)
                const ros2Node = await ros2Instance.getNode();
                node.client = ros2Node.createClient(config['selectedtype'], config['topic']);
                node.usesSharedManager = false;
            }
            
            node.ready = true;
            node.status({ fill: "yellow", shape: "dot", text: "created"});
        } catch (error) {
            console.log("creating service client failed");
            console.log(error);
            node.ready = false;
            node.status({ fill: "red", shape: "dot", text: "error"});
        }
    };

    // The node is registered in the runtime using the name "Service Client"
    RED.nodes.registerType("Service Client", ServiceClientNode);

    //Function that sends to the html file the qos descriptions read from the json file
    RED.httpAdmin.get("/subqosdescription", RED.auth.needsPermission('Service Client.read'), function(req,res)
    {
        var description_path = __dirname + "/../qos-description.json";
        var rawdata  = fs.readFileSync(description_path);
        let json = JSON.parse(rawdata);
        res.json(json);
    });
}
