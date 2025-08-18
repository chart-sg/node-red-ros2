
## 🚀 Quick Start

### Prerequisites
- Ubuntu 22.04/24.04 with ROS2 (Jazzy)
- Node.js 14+ and npm
- Node-RED installed

### Step-by-Step Installation

#### 1️⃣ **Setup ROS2 Environment**
```bash
# For ROS2 Jazzy (Ubuntu 24.04)
source /opt/ros/<distro>/setup.bash
```

#### 2️⃣ **Install Dependencies in Order**
```bash
# Navigate to Node-RED directory
cd <your-node-red-project>  # e.g. <your-node-red-project> is ~/.node-red

# Install ros2 package (automatically includes manager)
npm install @chart/node-red-ros2
```

#### 3️⃣ **Install ROS2 Package**

**Option A: From .tgz file (Recommended for end users)**
```bash
npm install ./chart-node-red-ros2-1.0.0.tgz
```

**Option B: Symlink from source (Development/Testing)**
```bash
# Clone or download the source code
git clone <repository-url>
cd node-red-ros2

# Create global npm link
npm link

# Link in Node-RED directory
cd <your-node-red-project>  # e.g. <your-node-red-project> is ~/.node-red
npm link @chart/node-red-ros2
```

**Option C: From npm registry (When published)**
```bash
npm install @chart/node-red-ros2
```

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
