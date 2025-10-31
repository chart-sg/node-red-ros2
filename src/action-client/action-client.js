const { Ros2Instance } = require('../ros2/ros2-instance');
// Remove direct ActionClient import - we'll use SharedManager instead
// const { ActionClient } = require("rclnodejs");

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
    function ActionClientNode(config)
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
                // Initialize action client asynchronously for static topic
                this.initializeActionClient(config, node);
            }
            catch (error) {
                console.log("creating action client failed");
                console.log(error);
                node.ready = false;
                node.status({ fill: "red", shape: "dot", text: "error"});
            }
        } else {
            console.log("Dynamic action client - awaiting input with topic");
            node.ready = false;
            node.status({ fill: "yellow", shape: "dot", text: "awaiting topic" });
        }

        // Event emitted when the deploy is finished
        RED.events.once('flows:started', function() {
            if (node.ready) {
                node.status({ fill: "green", shape: "dot", text: "waiting to request action"});
            }
        });

        // Registers a listener to the input event,
        // which will be called whenever a message arrives at this node
        node.on('input', async function(msg) {
            // Determine the topic: use msg.topic if provided, otherwise fallback to config.topic
            const topic = msg.topic || config['topic'];

            if (!topic) {
                node.status({ fill: "red", shape: "dot", text: "missing topic" });
                return;
            }

            try {
                // Destroy existing client if topic changed
                if ((node.actionClientId || node.action_client) && node.currentTopic !== topic) {
                    if (node.usesSharedManager && node.actionClientId) {
                        // Destroy via SharedManager
                        const ros2Bridge = require('@chart-sg/node-red-ros2-manager');
                        const manager = ros2Bridge.getROS2Manager();
                        manager.destroyActionClient(node.actionClientId);
                        node.actionClientId = null;
                        console.log("Previous action client destroyed via SharedManager for topic change");
                    } else if (node.action_client) {
                        // Destroy direct ActionClient
                        node.action_client.destroy();
                        node.action_client = null;
                        console.log("Previous action client destroyed for topic change");
                    }
                }

                // Create new client if needed
                if (!node.actionClientId && !node.action_client) {
                    const dynamicConfig = { ...config, topic: topic };
                    
                    await node.initializeActionClient(dynamicConfig, node);
                    node.currentTopic = topic;
                    node.status({ fill: "green", shape: "dot", text: `ready on: ${topic}` });
                }
            } catch (error) {
                console.log("Error creating action client:", error);
                node.status({ fill: "red", shape: "dot", text: "action client error" });
                node.ready = false;
                return;
            }

            // Perform action (for both static and dynamic clients)
            if (node.ready && (node.actionClientId || node.action_client)) {
                // Check if action server is available
                let isAvailable = false;
                
                if (node.usesSharedManager && node.actionClientId) {
                    // Check via SharedManager
                    const ros2Bridge = require('@chart-sg/node-red-ros2-manager');
                    const manager = ros2Bridge.getROS2Manager();
                    isAvailable = manager.isActionServerAvailable(node.actionClientId);
                } else if (node.action_client) {
                    // Check direct ActionClient
                    isAvailable = node.action_client.isActionServerAvailable();
                }
                
                if (!isAvailable) {
                    node.status({ fill: "yellow", shape: "dot", text: "action not available"});
                    return;
                }

                node.future_action_result = performing_action(node, msg.payload);
            }
            else {
               console.log("node was not ready to process flow data");
            }
        });

        // Called when there is a re-deploy or the program is closed
        node.on('close', function() {
            if (node.actionClientId) {
                // Cleanup via SharedManager
                try {
                    const ros2Bridge = require('@chart-sg/node-red-ros2-manager');
                    const manager = ros2Bridge.getROS2Manager();
                    manager.destroyActionClient(node.actionClientId);
                    console.log("[ActionClient] Action client destroyed via SharedManager");
                } catch (error) {
                    console.warn("[ActionClient] Error destroying action client via SharedManager:", error.message);
                } finally {
                    node.actionClientId = null;
                }
            }
            
            // Note: We don't destroy the shared node since it's used by other components
            
            node.currentTopic = null;
            node.status({ fill: null, shape: null, text: ""});
        });
    }

    // Async method to initialize the action client
    ActionClientNode.prototype.initializeActionClient = async function(config, node) {
        try {
            console.log("[ActionClient] Using SharedManager for action client");
            
            // Get the SharedManager
            const ros2Bridge = require('@chart-sg/node-red-ros2-manager');
            const manager = ros2Bridge.getROS2Manager();
            
            // Wait for manager to be ready
            if (!manager || !manager.initialized) {
                throw new Error('SharedManager not available or not initialized');
            }
            
            // Use the shared nodeId from Ros2Instance (similar to RMF pattern)
            const { Ros2Instance } = require('../ros2/ros2-instance.js');
            const ros2Instance = Ros2Instance.instance();
            const sharedNodeId = await ros2Instance.getNodeId();
            
            console.log("[ActionClient] Using shared nodeId from Ros2Instance:", sharedNodeId);
            
            // Create action client through SharedManager using the shared nodeId
            node.actionClientId = await manager.createActionClient(
                sharedNodeId, 
                config['selectedtype'],
                config['topic']
            );
            
            node.usesSharedManager = true;
            node.ready = true;
            node.status({ fill: "yellow", shape: "dot", text: "created"});
            
            console.log("[ActionClient] Action client created via SharedManager:", node.actionClientId);
            
        } catch (error) {
            console.log("creating action client failed");
            console.log(error);
            node.ready = false;
            node.status({ fill: "red", shape: "dot", text: "error"});
        }
    };

    // performing action
    async function performing_action(node, goal_request)
    {
        console.log("try to send goal_request:");
        console.log(goal_request);
        try {
            if (!node.actionClientId) {
                throw new Error('Action client not initialized');
            }
            
            console.log("[ActionClient] Sending goal via SharedManager");
            
            const ros2Bridge = require('@chart-sg/node-red-ros2-manager');
            const manager = ros2Bridge.getROS2Manager();
            
            // Send goal through SharedManager with feedback callback
            const result = await manager.sendGoal(node.actionClientId, goal_request, function(feedback) {
                // Feedback callback
                node.status({ fill: "green", shape: "dot", text: "action is processing"});
                node.send([ null, { payload: feedback } ]);
            });
            
            node.status({ fill: "green", shape: "dot", text: "goal request published"});
            
            if (!result.success) {
                if (result.canceled) {
                    node.status({ fill: "yellow", shape: "dot", text: "goal was canceled"});
                } else if (result.aborted) {
                    node.status({ fill: "red", shape: "dot", text: "goal was aborted"});
                } else {
                    node.status({ fill: "red", shape: "dot", text: "goal failed"});
                }
                return;
            }
            
            console.log("action goal was accepted");
            console.log("received action result");
            node.status({ fill: "green", shape: "dot", text: "result received"});
            node.send([{ payload: result.result }, null ]);
            
        } catch (error) {
            console.log("Error in performing_action:");
            console.log(error);
            node.status({ fill: "red", shape: "dot", text: "error"});
        }
    }

    // The node is registered in the runtime using the name "Action Client"
    RED.nodes.registerType("Action Client", ActionClientNode);

    //Function that sends to the html file the qos descriptions read from the json file
    RED.httpAdmin.get("/subqosdescription", RED.auth.needsPermission('Action Client.read'), function(req,res)
    {
        var description_path = __dirname + "/../qos-description.json";
        var rawdata  = fs.readFileSync(description_path);
        let json = JSON.parse(rawdata);
        res.json(json);
    });
}
