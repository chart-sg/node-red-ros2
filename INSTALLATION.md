# Chart Node-RED ROS2 Package ```bash
# Navigate to your Node-RED project
cd ~/.node-red/projects/your-project

# Install with ROS2 environment sourced
source /opt/ros/jazzy/setup.bash  # or humble
npm install rclnodejs @chart/node-red-ros2
```tion Guide

## 🚀 Quick Start

### Prerequisites
- Ubuntu 22.04/24.04 with ROS2 (Humble/Jazzy)
- Node.js 14+ and npm
- Node-RED installed

### Step-by-Step Installation

#### 1️⃣ **Setup ROS2 Environment**
```bash
# For ROS2 Jazzy (Ubuntu 24.04)
source /opt/ros/<distro>/setup.bash  # e.g. <distro> is jazzy or humble
```

#### 2️⃣ **Install Dependencies in Order**
```bash
# Navigate to Node-RED directory
cd <your-node-red-project>  # e.g. <your-node-red-project> is ~/.node-red

# Install rclnodejs with ROS2 environment sourced
npm install rclnodejs

# Install ros2 package (automatically includes manager)
npm install @chart/node-red-ros2
```

#### 3️⃣ **Alternative: Project-Specific Installation**
```bash
# Navigate to your Node-RED project
cd <your-node-red-project>  # e.g. <your-node-red-project> is ~/.node-red/projects/your-project

# Install with ROS2 environment sourced
source /opt/ros/<distro>/setup.bash  # e.g. <distro> is jazzy or humble
npm install rclnodejs @chart/node-red-ros2-manager @chart/node-red-ros2
```

## 📦 Manual .tgz Installation

If installing from .tgz files:

```bash
# 1. Source ROS2 environment
source /opt/ros/<distro>/setup.bash  # e.g. <distro> is jazzy or humble

# 2. Install dependencies first
cd <your-node-red-project>  # e.g. <your-node-red-project> is ~/.node-red
npm install rclnodejs

# 3. Install packages in order
npm install ./chart-node-red-ros2-1.0.0.tgz
```

## ❌ Common Issues

### "Missing node modules" error
- **Cause**: Dependencies not installed or ROS2 environment not sourced
- **Fix**: Follow step-by-step installation above

### "rclnodejs not found" error  
- **Cause**: rclnodejs installed without ROS2 environment
- **Fix**: 
  ```bash
  npm uninstall rclnodejs
  source /opt/ros/<distro>/setup.bash  # e.g. <distro> is jazzy or humble
  npm install rclnodejs
  ```

### Nodes not appearing in palette
- **Cause**: Installation order incorrect
- **Fix**: Install ros2-manager before ros2 package

## 🔧 Verification

After installation, verify your setup:

```bash
# Check ROS2 environment
echo $ROS_DISTRO
ros2 pkg list | head -5

# Start Node-RED (with ROS2 sourced)
source /opt/ros/jazzy/setup.bash
node-red
```

Visit `http://localhost:1880` and look for ROS2 nodes in the palette.

## 📚 Next Steps

- Check out [examples](./example/) for sample flows
- Read the [README](./README.md) for detailed usage
- See [Chart ROS2 Documentation](https://chart-sg.github.io/node-red-ros2/) for advanced topics
