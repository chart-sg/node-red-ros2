ARG ROS_DISTRO=jazzy
FROM eduartrobotik/eduart-robot:0.5.0

# Avoid interactuation with installation of some package that needs the locale.
USER root
ENV TZ=Europe/Berlin
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
ENV ROS_DISTRO=jazzy

# Avoids using interactions during building
ENV DEBIAN_FRONTEND=noninteractive

# Use a bash shell so it is possigle to run things like `source` (required for colcon builds)
SHELL ["/bin/bash", "-c"]

# Installing Node Red with ROS2 node.js integration
# RUN echo "Installing Node Red with ROS2 Plugin" \
#     cd /home/$USER \
#     && wget https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh \
#     && chmod u+x install.sh \
#     && ./install.sh \
#     && export NVM_DIR="$HOME/.nvm" \
#     && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion" \
#     && nvm install 18 node \
#     && source /opt/ros/$ROS_DISTRO/setup.bash \
#     && source /home/user/ros/install/setup.bash \
#     && npm install -g --unsafe-perm \
#         node-red \
#         rclnodejs \
#         cron

# Install Integration Service dependencies
RUN apt-get update \
    && apt-get remove -y \
        nodejs \
        libnode-dev \
        libnode72 \
    && apt-get install -y \
        cmake \
        curl \
        g++ \
        gcc \
        make \
        git \
        libasio-dev \
        libboost-dev \
        libboost-program-options-dev \
        libboost-system-dev \
        libcurl4-openssl-dev \
        libcurlpp-dev \
        libssl-dev \
        libwebsocketpp-dev \
        libyaml-cpp-dev \
        wget \
        python3-colcon-common-extensions \
        python3-vcstool \
    && curl -sL https://deb.nodesource.com/setup_18.x -o nodesource_setup.bash && \
    chmod +x nodesource_setup.bash && \
    bash -c ./nodesource_setup.bash && \
    apt-get install -y \
        nodejs \
        ros-$ROS_DISTRO-turtlesim \
        ros-$ROS_DISTRO-control-msgs \
        ros-$ROS_DISTRO-nav2-msgs \
        ros-$ROS_DISTRO-aruco-opencv-msgs \
        ros-$ROS_DISTRO-zbar-ros-interfaces


# Install Node-RED and node-red-ros2-plugin
RUN source /opt/ros/$ROS_DISTRO/setup.bash \
    && source /home/user/ros/install/setup.bash \
    # && export NVM_DIR="$HOME/.nvm" \
    # && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion" \
    && npm install -g --unsafe-perm \
        npm i -g rimraf \
        node-red \
        rclnodejs \
        cron

# Coping and Installing ROS2 Plugin
COPY ./edu_nodered_ros2_plugin /home/user/edu_nodered_ros2_plugin
RUN echo "installing plugins" \
    # instlling dashboad
    && npm install -g node-red-dashboard \
    # Installing
    && cd /home/user/ \
    # && export NVM_DIR="$HOME/.nvm" \
    # && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion" \
    && npm install -g ./edu_nodered_ros2_plugin

RUN echo "creating storage for flow data" \
    && mkdir -p /data \
    && chmod a+w /data

# Enable overlay execution
WORKDIR /
COPY ./entrypoint.bash .
RUN chmod +x /entrypoint.bash

# CMD [ "node", "/usr/bin/node-red" ]
CMD /usr/bin/node-red
ENTRYPOINT [ "/entrypoint.bash" ]
