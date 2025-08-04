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

        // \todo handle domain id differently
        if(config.domain) {
            // modify the global domain
            node.domain = RED.nodes.getNode(config.domain).domain;
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
                        const ros2Bridge = require('@chart/node-red-ros2-manager');
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
                    const ros2Bridge = require('@chart/node-red-ros2-manager');
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
            if (node.usesSharedManager && node.actionClientId) {
                // Cleanup via SharedManager
                try {
                    const ros2Bridge = require('@chart/node-red-ros2-manager');
                    const manager = ros2Bridge.getROS2Manager();
                    manager.destroyActionClient(node.actionClientId);
                    console.log("[ActionClient] Action client destroyed via SharedManager");
                } catch (error) {
                    console.warn("[ActionClient] Error destroying action client via SharedManager:", error.message);
                } finally {
                    node.actionClientId = null;
                }
            } else if (node.action_client) {
                // Cleanup direct ActionClient
                node.action_client.destroy();
                node.action_client = null;
            }
            node.currentTopic = null;
            node.usesSharedManager = false;
            node.status({ fill: null, shape: null, text: ""});
        });
    }

    // Async method to initialize the action client
    ActionClientNode.prototype.initializeActionClient = async function(config, node) {
        try {
            // Get ROS2 instance (which uses SharedManager if available)
            const ros2Instance = Ros2Instance.instance();
            await ros2Instance.waitForReady();
            
            // Check if we're using the bridge (SharedManager)
            if (ros2Instance.usesBridge) {
                console.log("[ActionClient] Using SharedManager approach for action client");
                
                // Get the bridge manager
                const ros2Bridge = require('@chart/node-red-ros2-manager');
                const manager = ros2Bridge.getROS2Manager();
                
                // Create action client through SharedManager
                node.actionClientId = await manager.createActionClient(
                    ros2Instance.nodeId,
                    config['selectedtype'],
                    config['topic']
                );
                
                node.usesSharedManager = true;
                console.log("[ActionClient] Action client created via SharedManager:", node.actionClientId);
                
            } else {
                console.log("[ActionClient] Using direct approach for action client (standalone mode)");
                
                // Fallback to direct ActionClient (for standalone use)
                const { ActionClient } = require("rclnodejs");
                const ros2Node = await ros2Instance.getNode();
                node.action_client = new ActionClient(ros2Node, config['selectedtype'], config['topic']);
                node.usesSharedManager = false;
            }
            
            node.ready = true;
            node.status({ fill: "yellow", shape: "dot", text: "created"});
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
            if (node.usesSharedManager && node.actionClientId) {
                // Use SharedManager approach (like RMF client)
                console.log("[ActionClient] Sending goal via SharedManager");
                
                const ros2Bridge = require('@chart/node-red-ros2-manager');
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
                
            } else if (node.action_client) {
                // Use direct ActionClient approach (fallback for standalone)
                console.log("[ActionClient] Sending goal via direct ActionClient");
                
                const goal_handle_promise = node.action_client.sendGoal(goal_request, function(feedback) {
                    // Passes the message to the next node in the flow
                    node.status({ fill: "green", shape: "dot", text: "action is processing"});
                    node.send([ null, { payload: feedback } ]);
                });
            
                node.status({ fill: "green", shape: "dot", text: "goal request published"});
                const goal_handle = await goal_handle_promise;

                if (goal_handle.isAccepted() == false) {
                    node.status({ fill: "red", shape: "dot", text: "goal request rejected"});
                    return;
                }

                console.log("action goal was accepted");
                const result = await goal_handle.getResult();
                console.log("received action result");

                if (goal_handle.isSucceeded() == false) {
                    node.status({ fill: "red", shape: "dot", text: "goal failed"});
                    return;
                }

                node.status({ fill: "green", shape: "dot", text: "result received"});
                node.send([{ payload: result }, null ]);
            } else {
                throw new Error("No action client available");
            }
        }
        catch (error) {
            console.log("sending goal request failed. error:");
            console.log(error);
            node.status({ fill: "red", shape: "dot", text: "sending goal request failed"});
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
