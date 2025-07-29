const { Ros2Instance } = require('../ros2/ros2-instance');
const { ActionClient } = require("rclnodejs");

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
            // For dynamic action clients, handle topic creation/changes
            if (!config['topic']) {
                const topic = msg.topic;

                if (!topic) {
                    node.status({ fill: "red", shape: "dot", text: "missing topic in msg.topic" });
                    return;
                }

                try {
                    // Destroy existing client if topic changed
                    if (node.action_client && node.currentTopic !== topic) {
                        node.action_client.destroy();
                        node.action_client = null;
                        console.log("Previous action client destroyed for topic change");
                    }

                    // Create new client if needed
                    if (!node.action_client) {
                        const dynamicConfig = { ...config, topic: topic };
                        
                        await node.initializeActionClient(dynamicConfig, node);
                        node.currentTopic = topic;
                        node.status({ fill: "green", shape: "dot", text: `ready on: ${topic}` });
                    }
                } catch (error) {
                    console.log("Error creating dynamic action client:", error);
                    node.status({ fill: "red", shape: "dot", text: "action client error" });
                    node.ready = false;
                    return;
                }
            }

            // Perform action (for both static and dynamic clients)
            if (node.ready && node.action_client) {
                if (node.action_client.isActionServerAvailable() == false) {
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
            if (node.action_client) {
                node.action_client.destroy();
                node.action_client = null;
            }
            node.currentTopic = null;
            node.status({ fill: null, shape: null, text: ""});
        });
    }

    // Async method to initialize the action client
    ActionClientNode.prototype.initializeActionClient = async function(config, node) {
        try {
            // Wait for ROS2 node to be ready
            const ros2Node = await Ros2Instance.instance().getNode();
            
            node.action_client = new ActionClient(ros2Node, config['selectedtype'], config['topic']);
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
            // service is available and ready
            const goal_handle_promise = node.action_client.sendGoal(goal_request, function(feedback) {
                // Passes the message to the next node in the flow
                node.status({ fill: "green", shape: "dot", text: "action is processing"});
                node.send([ null, { payload: feedback } ]);
            });
        
            node.status({ fill: "green", shape: "dot", text: "goal request published"});
            const goal_handle = await goal_handle_promise;

            if (goal_handle.isAccepted() == false) {
                node.status({ fill: "red", shape: "dot", text: "gaol request rejected"});
                return;
            }

            console.log("action goal was accepted");
            const result = await goal_handle.getResult();
            console.log("received action result");

            if (goal_handle.isSucceeded() == false) {
                node.status({ fill: "red", shape: "dot", text: "gaol failed"});
                return;
            }

            node.status({ fill: "green", shape: "dot", text: "result received"});
            node.send([{ payload: result }, null ]);
        }
        catch (error) {
            console.log("sending goal request failed. error:");
            console.log(error);
            node.status({ fill: "red", shape: "dot", text: "sending gaol request failed"});
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
