const rclnodejs = require("rclnodejs");

// Try to import the bridge package
let ros2Bridge = null;

try {
  ros2Bridge = require('@chart/node-red-ros2-bridge');
  console.log('EDU-ROS2: Using @chart/node-red-ros2-bridge for shared ROS2 management');
} catch (error) {
  console.log('EDU-ROS2: Bridge package not found, using fallback implementation:', error.message);
}

class Ros2Instance {
  static #_instance = undefined;
  
  constructor() {
    this.ros_node = null;
    this.nodeId = null;
    this.initialized = false;
    this.usesBridge = false;
    this.initPromise = null;
  }

  // Initialize ROS2 asynchronously
  async #init() {
    if (this.initialized) {
      return;
    }
    
    // Strategy 1: Use bridge package if available
    if (ros2Bridge) {
      try {
        console.log('EDU-ROS2: Initializing with bridge package...');
        
        // Get the shared ROS2 manager from bridge
        const manager = ros2Bridge.getROS2Manager();
        
        // Initialize if not already done
        await manager.initialize({
          owner: 'chart-node-red-ros2'
        });
        
        // Create a unique node name
        const timestamp = Date.now();
        const nodeName = `chart_ros2_${timestamp}`;
        
        // Create node through bridge
        const result = await manager.createNode(nodeName);
        this.nodeId = result.nodeId;
        this.ros_node = result.node;
        this.usesBridge = true;
        this.initialized = true;
        
        console.log('EDU-ROS2: Successfully initialized with bridge package');
        return;
      } catch (error) {
        console.warn('EDU-ROS2: Bridge initialization failed:', error.message);
        // Continue to fallback
      }
    }
    
    // Strategy 2: Direct rclnodejs fallback (for standalone use)
    console.log('EDU-ROS2: Using direct rclnodejs initialization (standalone mode)');
    console.warn('EDU-ROS2: For multi-plugin compatibility, install @chart/node-red-ros2-bridge');
    
    try {
      await rclnodejs.init();
      this.ros_node = rclnodejs.createNode("chart_ros2_standalone");
      rclnodejs.spin(this.ros_node);
      this.nodeId = null;
      this.usesBridge = false;
      this.initialized = true;
      console.log('EDU-ROS2: Initialized in standalone mode');
    } catch (directError) {
      console.error('EDU-ROS2: All initialization strategies failed:', directError);
      this.initialized = false;
      throw new Error(`@chart/node-red-ros2 failed to initialize: ${directError.message}`);
    }
  }

  static instance() {
    if (Ros2Instance.#_instance == undefined) {
      Ros2Instance.#_instance = new Ros2Instance();
    }

    return Ros2Instance.#_instance;
  }

  // Async method to wait for ROS2 to be ready
  async waitForReady() {
    if (!this.initPromise) {
      this.initPromise = this.#init();
    }
    await this.initPromise;
    return this.initialized;
  }
  
  // Async method to get the node (recommended)
  async getNode() {
    await this.waitForReady();
    return this.ros_node;
  }
  
  // Sync getter (for backward compatibility)
  get node() {
    if (!this.initialized) {
      console.warn('EDU-ROS2: Accessing node before initialization. Use await getNode() instead.');
    }
    return this.ros_node;
  }
  
  // Check if initialization is complete
  isReady() {
    return this.initialized;
  }
  
  // Check if using bridge
  isUsingBridge() {
    return this.usesBridge;
  }
  
  // Cleanup method
  cleanup() {
    try {
      if (this.usesBridge && ros2Bridge && this.nodeId) {
        console.log('EDU-ROS2: Cleaning up bridge-managed node...');
        const manager = ros2Bridge.getROS2Manager();
        manager.destroyNode(this.nodeId);
        this.nodeId = null;
      } else if (!this.usesBridge && this.ros_node) {
        console.log('EDU-ROS2: Cleaning up standalone node...');
        try {
          this.ros_node.destroy();
        } catch (error) {
          console.warn('EDU-ROS2: Error during standalone cleanup:', error.message);
        }
      }
    } catch (error) {
      console.error('EDU-ROS2: Error during cleanup:', error.message);
    } finally {
      this.ros_node = null;
      this.initialized = false;
      this.usesBridge = false;
    }
  }
  
  // Static cleanup method
  static cleanup() {
    if (this.#_instance) {
      console.log('EDU-ROS2: Cleaning up singleton instance...');
      this.#_instance.cleanup();
      this.#_instance = undefined;
    }
  }
}

// Add Node-RED lifecycle event listener for proper cleanup
if (typeof RED !== 'undefined') {
  RED.events.on('runtime-event', function(event) {
    if (event.id === 'runtime-unsupported' || event.id === 'flows:stopped') {
      console.log('EDU-ROS2: Node-RED shutdown detected, cleaning up...');
      Ros2Instance.cleanup();
    }
  });
}

module.exports = { Ros2Instance }
