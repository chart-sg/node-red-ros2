// Import required SharedManager package and get rclnodejs from it
let ros2Bridge = null;
let rclnodejs = null;
let bridgeAvailable = false;

try {
  ros2Bridge = require('@chart-sg/node-red-ros2-manager');
  const manager = ros2Bridge.getROS2Manager();
  rclnodejs = manager.getRclnodejs();
  console.log('ROS2: Using @chart-sg/node-red-ros2-manager for shared ROS2 management');
  bridgeAvailable = true;
} catch (error) {
  console.error('ROS2: Failed to load required @chart-sg/node-red-ros2-manager:', error.message);
  throw new Error('@chart-sg/node-red-ros2 requires @chart-sg/node-red-ros2-manager to be installed. Please install it with: npm install @chart-sg/node-red-ros2-manager');
}

class Ros2Instance {
  static #_instance = undefined;
  
  constructor() {
    this.ros_node = null;
    this.nodeId = null;
    this.initialized = false;
    this.initPromise = null;
    this.usesBridge = true; // Always use bridge since it's required
  }

  // Initialize ROS2 asynchronously
  async #init() {
    if (this.initialized) {
      return;
    }
    
    // Initialize using SharedManager (required)
    try {
      console.log('ROS2: Initializing with SharedManager...');
      
      // Get the shared ROS2 manager from bridge
      const manager = ros2Bridge.getROS2Manager();
      
      // Initialize if not already done
      await manager.initialize({
        owner: 'chart-node-red-ros2'
      });
      
      // Create a descriptive node name
      const timestamp = Date.now();
      const nodeName = `node_red_ros2_${timestamp}`;
      
      // Create node through bridge
      const result = await manager.createNode(nodeName);
      this.nodeId = result.nodeId;
      this.ros_node = result.node;
      this.initialized = true;
      
      console.log('ROS2: Successfully initialized with SharedManager');
      return;
    } catch (error) {
      console.error('ROS2: SharedManager initialization failed:', error.message);
      throw new Error(`@chart-sg/node-red-ros2 requires @chart-sg/node-red-ros2-manager for proper operation: ${error.message}`);
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
      console.warn('ROS2: Accessing node before initialization. Use await getNode() instead.');
    }
    return this.ros_node;
  }
  
  // Async method to get the nodeId
  async getNodeId() {
    await this.waitForReady();
    return this.nodeId;
  }
  
  // Check if initialization is complete
  isReady() {
    return this.initialized;
  }
  
  // Cleanup method
  cleanup() {
    try {
      if (this.nodeId && ros2Bridge) {
        console.log('ROS2: Cleaning up SharedManager-managed node...');
        const manager = ros2Bridge.getROS2Manager();
        manager.destroyNode(this.nodeId);
        this.nodeId = null;
      }
    } catch (error) {
      console.error('ROS2: Error during cleanup:', error.message);
    } finally {
      this.ros_node = null;
      this.initialized = false;
    }
  }
  
  // Static cleanup method
  static cleanup() {
    if (this.#_instance) {
      console.log('ROS2: Cleaning up singleton instance...');
      this.#_instance.cleanup();
      this.#_instance = undefined;
    }
  }
}

// Add Node-RED lifecycle event listener for proper cleanup
if (typeof RED !== 'undefined') {
  RED.events.on('runtime-event', function(event) {
    if (event.id === 'runtime-unsupported' || event.id === 'flows:stopped') {
      console.log('ROS2: Node-RED shutdown detected, cleaning up...');
      Ros2Instance.cleanup();
    }
  });
}

module.exports = { Ros2Instance }
