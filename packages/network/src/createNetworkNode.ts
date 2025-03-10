import { v4 as uuidv4 } from 'uuid'
import { MetricsContext } from './helpers/MetricsContext'

import { TrackerInfo, AbstractNodeOptions } from './identifiers'
import { NodeToTracker } from './protocol/NodeToTracker'
import { NodeToNode } from './protocol/NodeToNode'
import { RtcSignaller } from './logic/node/RtcSignaller'
import { NetworkNode } from './logic/node/NetworkNode'
import { NegotiatedProtocolVersions } from './connection/NegotiatedProtocolVersions'
import { PeerInfo } from './connection/PeerInfo'
import NodeClientWsEndpoint from './connection/ws/NodeClientWsEndpoint'
import { WebRtcEndpoint } from './connection/WebRtcEndpoint'
import NodeWebRtcConnectionFactory from './connection/NodeWebRtcConnection'

export interface NetworkNodeOptions extends AbstractNodeOptions {
    trackers: TrackerInfo[],
    disconnectionWaitTime?: number,
    peerPingInterval?: number
    newWebrtcConnectionTimeout?: number,
    webrtcDatachannelBufferThresholdLow?: number,
    webrtcDatachannelBufferThresholdHigh?: number,
    stunUrls?: string[],
    rttUpdateTimeout?: number,
    trackerConnectionMaintenanceInterval?: number
    webrtcDisallowPrivateAddresses?: boolean,
    acceptProxyConnections?: boolean
}

export const createNetworkNode = ({
    id = uuidv4(),
    name,
    location,
    trackers,
    metricsContext = new MetricsContext(id),
    peerPingInterval,
    trackerPingInterval,
    disconnectionWaitTime,
    newWebrtcConnectionTimeout,
    rttUpdateTimeout,
    webrtcDatachannelBufferThresholdLow,
    webrtcDatachannelBufferThresholdHigh,
    stunUrls = ['stun:stun.l.google.com:19302'],
    trackerConnectionMaintenanceInterval,
    webrtcDisallowPrivateAddresses = false,
    acceptProxyConnections
}: NetworkNodeOptions): NetworkNode => {
    const peerInfo = PeerInfo.newNode(id, name, undefined, undefined, location)
    const endpoint = new NodeClientWsEndpoint(peerInfo, metricsContext, trackerPingInterval)
    const nodeToTracker = new NodeToTracker(endpoint)

    const webRtcSignaller = new RtcSignaller(peerInfo, nodeToTracker)
    const negotiatedProtocolVersions = new NegotiatedProtocolVersions(peerInfo)
    const nodeToNode = new NodeToNode(new WebRtcEndpoint(
        peerInfo,
        stunUrls,
        webRtcSignaller,
        metricsContext,
        negotiatedProtocolVersions,
        NodeWebRtcConnectionFactory,
        newWebrtcConnectionTimeout,
        peerPingInterval,
        webrtcDatachannelBufferThresholdLow,
        webrtcDatachannelBufferThresholdHigh,
        webrtcDisallowPrivateAddresses
    ))

    return new NetworkNode({
        peerInfo,
        trackers,
        protocols: {
            nodeToTracker,
            nodeToNode
        },
        metricsContext,
        disconnectionWaitTime,
        rttUpdateTimeout,
        trackerConnectionMaintenanceInterval,
        acceptProxyConnections
    })
}
