const socketState = require('./socketState');

const logger = require('../utils/logger');

module.exports = (io) => {
    io.on('connection', (socket) => {
        logger.info(`🔌 Client connected: ${socket.id}`);

        const syncToClient = () => {
            socket.emit('ai_flow_sync', socketState.globalFlow);
            socket.emit('ai_system_sync', { running: socketState.globalAiRunning });
            socket.emit('ai_search_sync', socketState.globalTargetClasses);
        };

        socket.on('join_robot_room', (robotId) => {
            socket.join(robotId);
            if (robotId === 'WEBCAM_PROCESSED') syncToClient();
        });

        socket.on('flow_topology_update', (data) => {
            socketState.globalFlow = data;
            io.emit('ai_flow_sync', data);
        });

        socket.on('ai_system_toggle', (data) => {
            socketState.globalAiRunning = data.running;
            io.emit('ai_system_sync', data);
        });

        socket.on('update_search_classes', (data) => {
            logger.info(`🔍 Search classes update received: "${data}"`);
            socketState.globalTargetClasses = data;
            io.emit('ai_search_sync', data);
            io.emit('update_search_classes', data); // Relay to AI Engine
        });

        socket.on('ai_params_sync', (data) => {
            io.emit('ai_params_sync', data);
        });

        socket.on('video_frame_from_robot', (data) => socket.to(data.robotId).emit('stream_to_web', data.image));
        socket.on('video_frame_from_webcam', (data) => io.emit('ai_webcam_frame', data));
        socket.on('training_progress', (data) => io.emit('ai_training_progress', data));
        
        socket.on('send_command_to_robot', (data) => {
            logger.info(`🤖 Command to ${data.robotId}: ${data.command}`);
            io.to(data.robotId).emit('robot_execute', data);
        });

        socket.on('robot_command', (data) => {
            logger.info(`🤖 [AI→Robot] ${data.robotId}: ${data.command}`);
            io.to(data.robotId).emit('robot_execute', data);
            io.emit('robot_command_log', data);
        });

        socket.on('det_results', (data) => {
            io.emit('det_results', data);
        });

        socket.on('robot_ping', (data) => {
            io.emit('robot_online', { robotId: data.robotId, ts: Date.now() });
            syncToClient();
        });

        socket.on('disconnect', () => logger.info(`❌ Client disconnected: ${socket.id}`));
    });
};
