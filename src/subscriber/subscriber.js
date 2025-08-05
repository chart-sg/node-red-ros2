const { Ros2Instance } = require('../ros2/ros2-instance');
const rclnodejs = require("rclnodejs");

function get_qos_from_props (config)
{
    var qos = { "qos": {}};
    config.forEach( function(q) {
        var pos = q.p.indexOf('.');
        if (pos != -1) {
            var qos_type = q.p.substr(0, pos);
            var param = q.p.substr(pos + 1);

            if (!Object.keys(qos["qos"]).includes(qos_type)) {
                qos["qos"][qos_type] = {};
            }

            pos = param.indexOf('.');

            if (pos != -1) {
                param = param.substr(pos + 1);
            }

            qos["qos"][qos_type][param] = q.v;
        }
        else {
            qos["qos"][q.p] = q.v;
        }
    });

    qos_mapped = new rclnodejs.QoS();
    if (qos['qos']['history'] != undefined && qos['qos']['history']['kind'] != undefined) {
        qos_mapped.history = rclnodejs.QoS.HistoryPolicy['RMW_QOS_POLICY_HISTORY_' + qos['qos']['history']['kind']];
    }
    if (qos['qos']['reliability'] != undefined) {
        qos_mapped.reliability = rclnodejs.QoS.ReliabilityPolicy['RMW_QOS_POLICY_RELIABILITY_' + qos['qos']['reliability']];
    }
    if (qos['qos']['durability'] != undefined) {
        qos_mapped.durability = rclnodejs.QoS.DurabilityPolicy['RMW_QOS_POLICY_DURABILITY_' + qos['qos']['durability']];
    }
    if (qos['qos']['history'] != undefined && qos['qos']['history']['depth'] != undefined) {
        qos_mapped.depth = Number(qos['qos']['history']['depth']);
    }
    else {
        qos_mapped.depth = 2;
    }

    return qos_mapped;
};


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
    function SubscriberNode(config)
    {
        // Initiliaze the features shared by all nodes
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
                qos = get_qos_from_props(config['props']);

                // Initialize subscription asynchronously for static topic
                this.initializeSubscription(config, qos, node);
            }
            catch (error) {
                console.log("creating subscription failed");
                console.log(error);
                node.ready = false;
                node.status({ fill: "red", shape: "dot", text: "error"});
            }
        } else {
            console.log("Dynamic subscription - awaiting input with topic");
            node.ready = false;
            node.status({ fill: "yellow", shape: "dot", text: "awaiting topic" });
        }

        // Event emitted when the deploy is finished
        RED.events.once('flows:started', function() {
            if (node.ready) {
                node.status({ fill: "green", shape: "dot", text: "waiting to receive message"});
            }
        });

        // Input handler for dynamic topic subscription
        node.on('input', async function(msg) {
            // For static subscriptions, this input handler is not used
            if (config['topic']) {
                return; // Static subscription already created
            }

            // Determine the topic: use msg.topic if provided
            const topic = msg.topic;

            if (!topic) {
                node.status({ fill: "red", shape: "dot", text: "missing topic in msg.topic" });
                return;
            }

            try {
                // Destroy existing subscription if topic changed
                if (node.subscription && node.currentTopic !== topic) {
                    const ros2Node = await Ros2Instance.instance().getNode();
                    ros2Node.destroySubscription(node.subscription);
                    node.subscription = null;
                    console.log("Previous subscription destroyed for topic change");
                }

                // Create new subscription if needed
                if (!node.subscription) {
                    const qos = get_qos_from_props(config['props']);
                    const dynamicConfig = { ...config, topic: topic };
                    
                    await node.initializeSubscription(dynamicConfig, qos, node);
                    node.currentTopic = topic;
                    node.status({ fill: "green", shape: "dot", text: `subscribed to: ${topic}` });
                }
            } catch (error) {
                console.log("Error creating dynamic subscription:", error);
                node.status({ fill: "red", shape: "dot", text: "subscription error" });
                node.ready = false;
            }
        });

        // Called when there is a re-deploy or the program is closed
        node.on('close', async function() {
            if (node.subscription) {
                try {
                    const ros2Node = await Ros2Instance.instance().getNode();
                    ros2Node.destroySubscription(node.subscription);
                } catch (error) {
                    console.log("Error destroying subscription:", error.message);
                }
                node.subscription = null;
            }
            node.currentTopic = null;
            node.status({ fill: null, shape: null, text: ""});
        });
    }

    // Async method to initialize the subscription
    SubscriberNode.prototype.initializeSubscription = async function(config, qos, node) {
        try {
            // Wait for ROS2 node to be ready
            const ros2Node = await Ros2Instance.instance().getNode();
            
            node.subscription = ros2Node.createSubscription(
                config['selectedtype'], config['topic'], { qos }, function(msg) {
                    // Callback Function for Receiving a ROS Message
                    node.status({ fill: "green", shape: "dot", text: "message received" });
                    // Passes the message to the next node in the flow
                    node.send({ payload: msg });
            });
            node.ready = true;
            node.status({ fill: "yellow", shape: "dot", text: "created"});
        } catch (error) {
            console.log("creating subscription failed");
            console.log(error);
            node.ready = false;
            node.status({ fill: "red", shape: "dot", text: "error"});
        }
    };

    // The node is registered in the runtime using the name Subscriber
    RED.nodes.registerType("Subscriber", SubscriberNode);

    //Function that sends to the html file the qos descriptions read from the json file
    RED.httpAdmin.get("/subqosdescription", RED.auth.needsPermission('Subscriber.read'), function(req,res)
    {
        var description_path = __dirname + "/../qos-description.json";
        var rawdata  = fs.readFileSync(description_path);
        let json = JSON.parse(rawdata);
        res.json(json);
    });
}
