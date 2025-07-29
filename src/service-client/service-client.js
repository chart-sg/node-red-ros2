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

        // \todo handle domain id differently
        if(config.domain) {
            // modify the global domain
            node.domain = RED.nodes.getNode(config.domain).domain;
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
                    if (node.client && node.currentTopic !== topic) {
                        const ros2Node = await Ros2Instance.instance().getNode();
                        ros2Node.destroyClient(node.client);
                        node.client = null;
                        console.log("Previous service client destroyed for topic change");
                    }

                    // Create new client if needed
                    if (!node.client) {
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
            if (node.ready && node.client) {
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
            else {
               console.log("node was not ready to process flow data");
            }
        });

        // Called when there is a re-deploy or the program is closed
        node.on('close', async function() {
            try {
                const ros2Node = await Ros2Instance.instance().getNode();
                ros2Node.destroyClient(node.client);
            } catch (error) {
                console.log("Error destroying service client:", error.message);
            }
            node.client = null;
            node.currentTopic = null;
            node.status({ fill: null, shape: null, text: ""});
        });
    }

    // Async method to initialize the service client
    ServiceClientNode.prototype.initializeServiceClient = async function(config, node) {
        try {
            // Wait for ROS2 node to be ready
            const ros2Node = await Ros2Instance.instance().getNode();
            
            node.client = ros2Node.createClient(config['selectedtype'], config['topic']);
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
