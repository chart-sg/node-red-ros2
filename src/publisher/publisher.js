const rclnodejs = require("rclnodejs");

function get_qos_from_props (config)
{
    var qos = { "qos": {}};
    config.forEach(function(q) {
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
        else
        {
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
        qos_mapped.durability = rclnodejs.QoS.DurabilityPolicy['RMW_QOS_POLICY_DURABILITY_' +  qos['qos']['durability']];
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
    const fs = require('fs');
    const { Ros2Instance } = require('../ros2/ros2-instance'); 

    // Helper function to convert uint64 fields to BigInt
    function convertUint64ToBigInt(payload, messageType) {
        console.log("=== CONVERT FUNCTION INPUT ===");
        console.log("Input payload type:", typeof payload);
        console.log("Input has hasMember:", typeof payload?.hasMember === 'function');
        console.log("Message type:", messageType);

        if (!payload || typeof payload !== 'object') {
            console.log("Payload is not an object, returning as-is");
            return payload;
        }

        // Check if this is already a proper ROS2 message object
        if (typeof payload.hasMember === 'function') {
            console.log("Payload has hasMember method - it's a ROS2 message object");
            console.log("Returning original payload without conversion");
            return payload; // Don't modify ROS2 message objects
        }

        console.log("Payload is a plain object, proceeding with conversion");

        // Clean the payload by removing Node-RED specific fields
        const cleanPayload = { ...payload };
        delete cleanPayload._msgid; // Remove Node-RED message ID
        delete cleanPayload.topic;  // Remove any topic field from inject nodes
        delete cleanPayload.selectedtype; // Remove any type selection fields

        console.log("Cleaned payload (removed Node-RED fields):", JSON.stringify(cleanPayload, null, 2));

        // Create a deep clone to avoid modifying the original
        function deepClone(obj) {
            if (obj === null || typeof obj !== 'object') {
                return obj;
            }
            if (obj instanceof Date) {
                return new Date(obj);
            }
            if (Array.isArray(obj)) {
                return obj.map(item => deepClone(item));
            }
            const cloned = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    cloned[key] = deepClone(obj[key]);
                }
            }
            return cloned;
        }

        const converted = deepClone(cleanPayload);
        console.log("Created deep clone, applying BigInt conversions...");

        // Get uint64 fields from actual message definition
        const uint64Fields = getUint64FieldsFromMessageType(messageType);
        console.log("Uint64 fields from message definition:", uint64Fields);

        // Convert fields based on message definition only
        if (uint64Fields && uint64Fields.length > 0) {
            console.log(`Converting ${uint64Fields.length} uint64 fields based on message definition`);
            convertSpecificFields(converted, uint64Fields);
        } else {
            console.log("No uint64 fields found in message definition - no conversion needed");
        }

        console.log("=== CONVERT FUNCTION OUTPUT ===");
        console.log("Output payload type:", typeof converted);
        console.log("Output has hasMember:", typeof converted?.hasMember === 'function');

        return converted;
    }

    // Get uint64 fields from actual message type definition
    function getUint64FieldsFromMessageType(messageType) {
        try {
            // Get the rclnodejs instance from SharedManager to ensure consistency
            const ros2Bridge = require('@chart-sg/node-red-ros2-manager');
            const manager = ros2Bridge.getROS2Manager();
            
            const rclnodejsInstance = manager.getRclnodejs();
            console.log("Using rclnodejs instance from SharedManager via getRclnodejs()");
            
            // Get the message class for the selected type
            const messageTypeParts = messageType.split('/');
            const packageName = messageTypeParts[0];
            const messageTypeName = messageTypeParts[2];
            
            const MessageClass = rclnodejsInstance.require(packageName).msg[messageTypeName];
            
            // Get the ROS message definition
            const messageDefinition = MessageClass.ROSMessageDef;
            
            if (messageDefinition && messageDefinition.fields) {
                const uint64Fields = [];
                extractUint64Fields(messageDefinition.fields, '', uint64Fields, rclnodejsInstance);
                return uint64Fields;
            }
        } catch (error) {
            console.error("Failed to get message definition for", messageType, ":", error.message);
            console.log("Falling back to no conversion");
            return null;
        }
        
        return null;
    }

    // Extract uint64 field paths from message definition
    function extractUint64Fields(fields, prefix, uint64Fields, rclnodejsInstance) {
        for (const field of fields) {
            const fieldPath = prefix ? `${prefix}.${field.name}` : field.name;
            
            if (field.type.type === 'uint64') {
                uint64Fields.push(fieldPath);
                console.log(`Found uint64 field: ${fieldPath}`);
            } else if (!field.type.isPrimitiveType && field.type.pkgName) {
                // This is a nested message type, need to get its definition
                try {
                    const NestedMessageClass = rclnodejsInstance.require(field.type.pkgName).msg[field.type.type];
                    
                    if (NestedMessageClass && NestedMessageClass.ROSMessageDef) {
                        extractUint64Fields(NestedMessageClass.ROSMessageDef.fields, fieldPath, uint64Fields, rclnodejsInstance);
                    }
                } catch (error) {
                    console.warn(`Could not inspect nested message type: ${field.type.pkgName}/msg/${field.type.type}`);
                }
            }
        }
    }

    // Convert specific fields identified from message definition
    function convertSpecificFields(obj, uint64Fields, currentPath = '') {
        if (!obj || typeof obj !== 'object') return;

        for (const key in obj) {
            const fieldPath = currentPath ? `${currentPath}.${key}` : key;
            const value = obj[key];

            if (uint64Fields && uint64Fields.includes(fieldPath)) {
                // This field is definitely uint64, convert it
                if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
                    try {
                        const bigintValue = BigInt(value);
                        obj[key] = bigintValue;
                        console.log(`Auto-converted ${fieldPath}: ${value} -> ${bigintValue} (BigInt) - from message definition`);
                    } catch (error) {
                        console.warn(`Failed to convert ${fieldPath} to BigInt:`, error.message);
                    }
                }
            } else if (typeof value === 'object' && value !== null) {
                if (Array.isArray(value)) {
                    value.forEach((item, index) => {
                        if (typeof item === 'object') {
                            convertSpecificFields(item, uint64Fields, `${fieldPath}[${index}]`);
                        }
                    });
                } else {
                    convertSpecificFields(value, uint64Fields, fieldPath);
                }
            }
        }
    }

    // Helper function to properly set message properties including nested objects
    function setMessageProperties(rosMessage, payload) {
        for (const key in payload) {
            if (payload.hasOwnProperty(key)) {
                const value = payload[key];
                
                try {
                    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                        // Handle nested objects by setting properties individually
                        if (rosMessage[key] && typeof rosMessage[key] === 'object') {
                            setMessageProperties(rosMessage[key], value);
                        } else {
                            rosMessage[key] = value;
                        }
                    } else {
                        // Direct assignment for primitive types, arrays, and BigInt
                        rosMessage[key] = value;
                    }
                } catch (error) {
                    console.warn(`Failed to set property '${key}':`, error.message);
                    console.warn(`Expected type for '${key}':`, typeof rosMessage[key]);
                    console.warn(`Provided value:`, value);
                    
                    // Special handling for common issues
                    if (key === 'parameters' && !Array.isArray(value)) {
                        console.log(`Converting '${key}' from object to array format`);
                        if (value && typeof value === 'object') {
                            // Convert single object to array
                            rosMessage[key] = [value];
                        } else {
                            // Default to empty array
                            rosMessage[key] = [];
                        }
                    }
                }
            }
        }
    }

    /*
     * @function PublisherNode constructor
     * This node is defined by the constructor function PublisherNode,
     * which is called when a new instance of the node is created
     *
     * @param {Object} config - Contains the properties set in the flow editor
     */
    function PublisherNode(config)
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
            // Creating Publisher
            try {
                qos = get_qos_from_props(config['props']);

                // Initialize publisher asynchronously for static topic
                this.initializePublisher(config, qos, node);
            }
            catch (error) {
                console.log("creating publisher failed");
                console.log(error);
                node.ready = false;
                node.status({ fill: "red", shape: "dot", text: "error"});
            }
        } else {
            console.log("Dynamic publisher - awaiting input with topic");
            node.ready = false;
            node.status({ fill: "yellow", shape: "dot", text: "awaiting topic" });
        }

        // Event emitted when the deploy is finished
        RED.events.once('flows:started', function() {
            node.status({ fill: "green", shape: "dot", text: "waiting to publish message"});
        });

        // Registers a listener to the input event,
        // which will be called whenever a message arrives at this node
        node.on('input', async function(msg) {
            // For dynamic publishers, handle topic creation/changes
            if (!config['topic']) {
                const topic = msg.topic;

                if (!topic) {
                    node.status({ fill: "red", shape: "dot", text: "missing topic in msg.topic" });
                    return;
                }

                try {
                    // Destroy existing publisher if topic changed
                    if (node.publisher && node.currentTopic !== topic) {
                        const ros2Node = await Ros2Instance.instance().getNode();
                        ros2Node.destroyPublisher(node.publisher);
                        node.publisher = null;
                        console.log("Previous publisher destroyed for topic change");
                    }

                    // Create new publisher if needed
                    if (!node.publisher) {
                        const qos = get_qos_from_props(config['props']);
                        const dynamicConfig = { ...config, topic: topic };
                        
                        await node.initializePublisher(dynamicConfig, qos, node);
                        node.currentTopic = topic;
                        node.status({ fill: "green", shape: "dot", text: `ready on: ${topic}` });
                    }
                } catch (error) {
                    console.log("Error creating dynamic publisher:", error);
                    node.status({ fill: "red", shape: "dot", text: "publisher error" });
                    node.ready = false;
                    return;
                }
            }

            // Publish the message (for both static and dynamic publishers)
            if (node.ready && node.publisher) {
                node.status({ fill: "green", shape: "dot", text: "message published"});

                // Log the original payload
                console.log("=== ORIGINAL PAYLOAD ===");
                console.log("Type:", typeof msg.payload);
                console.log("Constructor:", msg.payload?.constructor?.name);
                console.log("Has hasMember method:", typeof msg.payload?.hasMember === 'function');
                console.log("Payload:", JSON.stringify(msg.payload, (key, value) => 
                    typeof value === 'bigint' ? value.toString() + 'n' : value, 2));

                // Auto-convert uint64 fields to BigInt and create proper ROS message
                let convertedPayload = { ...msg.payload };
                
                // Create proper ROS message object using the SharedManager's rclnodejs instance
                try {
                    // Get the rclnodejs instance from SharedManager to ensure consistency
                    const ros2Bridge = require('@chart-sg/node-red-ros2-manager');
                    const manager = ros2Bridge.getROS2Manager();
                    
                    const rclnodejsInstance = manager.getRclnodejs();
                    console.log("Using rclnodejs instance from SharedManager via getRclnodejs()");
                    
                    // Get the message class for the selected type
                    const messageTypeParts = config.selectedtype.split('/');
                    const packageName = messageTypeParts[0];
                    const messageType = messageTypeParts[2];
                    
                    const MessageClass = rclnodejsInstance.require(packageName).msg[messageType];
                    
                    // Create proper ROS message instance
                    const rosMessage = new MessageClass();
                    
                    // Try to get uint64 fields from message definition
                    let uint64Fields = getUint64FieldsFromMessageType(config.selectedtype);
                    
                    if (uint64Fields && uint64Fields.length > 0) {
                        // Use message definition-based conversion
                        console.log(`Using message definition-based conversion for ${uint64Fields.length} uint64 fields:`, uint64Fields);
                        convertSpecificFields(convertedPayload, uint64Fields);
                    } else {
                        // No uint64 fields found in message definition
                        console.log("No uint64 fields found in message definition - no conversion needed");
                    }
                    
                    // Pre-validate and fix common payload issues
                    if (convertedPayload.parameters && !Array.isArray(convertedPayload.parameters)) {
                        console.log("Converting 'parameters' from object to array format");
                        if (convertedPayload.parameters.name || convertedPayload.parameters.value) {
                            // Convert single object to array
                            convertedPayload.parameters = [convertedPayload.parameters];
                        } else {
                            // Default to empty array
                            convertedPayload.parameters = [];
                        }
                    }
                    
                    // Clean Node-RED specific fields
                    const cleanPayload = { ...convertedPayload };
                    delete cleanPayload._msgid;
                    delete cleanPayload.topic;
                    delete cleanPayload.selectedtype;
                    
                    console.log("=== CLEANED PAYLOAD FOR ROS MESSAGE ===");
                    console.log(JSON.stringify(cleanPayload, (key, value) => 
                        typeof value === 'bigint' ? value.toString() + 'n' : value, 2));
                    
                    // Properly set all properties from converted payload
                    setMessageProperties(rosMessage, cleanPayload);
                    
                    console.log(`Publishing ${config.selectedtype} message with auto-converted BigInt fields`);
                    
                    // Publish the proper ROS message object
                    node.publisher.publish(rosMessage);
                    
                    // Send message to next node in the flow
                    node.send(msg);
                    
                } catch (error) {
                    console.error("Failed to create proper ROS message, falling back to direct payload:", error.message);
                    // Fallback to original approach (will probably fail but provides error context)
                    node.publisher.publish(convertedPayload);
                    node.send(msg);
                }
            }
            else {
               console.log("node was not ready to process flow data");
            }
        });

        // Called when there is a re-deploy or the program is closed
        node.on('close', async function() {
            try {
                const ros2Node = await Ros2Instance.instance().getNode();
                ros2Node.destroyPublisher(node.publisher);
            } catch (error) {
                console.log("Error destroying publisher:", error.message);
            }
            node.publisher = null;
            node.currentTopic = null;
            node.status({ fill: null, shape: null, text: ""});
        });
    }

    // Async method to initialize the publisher
    PublisherNode.prototype.initializePublisher = async function(config, qos, node) {
        try {
            // Wait for ROS2 node to be ready
            const ros2Node = await Ros2Instance.instance().getNode();
            
            node.publisher = ros2Node.createPublisher(config['selectedtype'], config['topic'], {qos});
            node.ready = true;
            node.status({ fill: "yellow", shape: "dot", text: "created"});
        } catch (error) {
            console.log("creating publisher failed");
            console.log(error);
            node.ready = false;
            node.status({ fill: "red", shape: "dot", text: "error"});
        }
    };

    // The node is registered in the runtime using the name Publisher
    RED.nodes.registerType("Publisher", PublisherNode);

    // Function that sends to the html file the qos descriptions read from the json file
    RED.httpAdmin.get("/pubqosdescription", RED.auth.needsPermission('Publisher.read'), function(req,res)
    {
        var description_path = __dirname + "/../qos-description.json";
        var rawdata  = fs.readFileSync(description_path);
        let json = JSON.parse(rawdata);
        res.json(json);
    });
}
