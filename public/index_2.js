//index.js
// https://127.0.0.1:3000/sfu/room1/
const io = require('socket.io-client')
const mediasoupClient = require('mediasoup-client')

const roomName = window.location.pathname.split('/')[2]
const socket = io("/mediasoup");

function logger(name="", items=[]){
  console.log(`S ---- ${name} ----`);
  items.forEach(item => {
    console.log(`${item} $####$\n`);
  });
  console.log(`**** xxx **** \n\n\n`)
};

function SS(name, value = ""){
  if(typeof value === "object"){
    return (`-> STRINGFIED :: ${name} :: ${JSON.stringify(value)}`)
  } else {
    return (`${name} :: ${value}`);
  }
}

socket.on('connection-success', ({ socketId, existsProducer }) => {
  console.log(socketId, existsProducer);
  logger("connection-success", [SS("socketId", socketId), SS("existsProducer",existsProducer)]);
  getLocalStream()
})

let device
let rtpCapabilities
let producerTransport
let consumerTransports = []
let producer
let consumer
let isProducer = false

// https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerOptions
// https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
let params = {
  // mediasoup params
  encodings: [
    {
      rid: 'r0',
      maxBitrate: 100000,
      scalabilityMode: 'S1T3',
    },
    {
      rid: 'r1',
      maxBitrate: 300000,
      scalabilityMode: 'S1T3',
    },
    {
      rid: 'r2',
      maxBitrate: 900000,
      scalabilityMode: 'S1T3',
    },
  ],
  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
  codecOptions: {
    videoGoogleStartBitrate: 1000
  }
};

let audioParams;
let videoParams = { params };
let consumingTransports = [];

const streamSuccess = (streams) => {
  logger("streamSuccess", [SS("stream", streams)]);

  // for (const track of stream.getTracks()) {
  //   // pc.addTrack(track);
  // }

  localVideo_1.srcObject = streams[0]
  localVideo_2.srcObject = streams[1]
  const track = streams[0].getVideoTracks()[0]
  const track_2 = streams[1].getVideoTracks()[0]
  logger("streamSuccess", [SS("track", track), SS("track_2", track_2) ]);
  params = {
    track,
    track_2,
    ...params
  }

  // logger("streamSuccess", [SS("track", track)]);
  logger("streamSuccess", [SS("params", params)]);


  joinRoom(true)
}

const joinRoom = () => {
  socket.emit('joinRoom', { roomName }, (data) => {
    console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`);
    logger("joinRoom", [SS("roomName", roomName) , SS("data", data)]);
    logger("joinRoom", [SS("data.rtpCapabilities", data.rtpCapabilities)]);

    // we assign to local variable and will be used when
    // loading the client Device (see createDevice above)
    rtpCapabilities = data.rtpCapabilities

    // once we have rtpCapabilities from the Router, create Device
    createDevice()
  })
}

const getLocalStream = () => {
//   [
//     {
//         "deviceId": "",
//         "kind": "audioinput",
//         "label": "",
//         "groupId": ""
//     },
//     {
//         "deviceId": "36e8db15cd20c1f37276fad0d6fbaa54ecd9a500ed34334777d36f10bf3bc3e6",
//         "kind": "videoinput",
//         "label": "FINGERS 1080 Hi-Res Webcam (05a3:9331)",
//         "groupId": "875c331275e1a2db8bdd2543bd1d02f195c336dad391646d53d4ef5ba8b5d907"
//     },
//     {
//         "deviceId": "c555dcb0e7240c4079fc97bf785a6b1ce39911227e6168ab6dda59a4697b0531",
//         "kind": "videoinput",
//         "label": "HP HD Camera (04f2:b66a)",
//         "groupId": "5d66d2b8dd6670ac862e7d5b6f5f58ed3f2e717b15d320f9091d94b9b03c3e92"
//     },
//     {
//         "deviceId": "",
//         "kind": "audiooutput",
//         "label": "",
//         "groupId": ""
//     }
// ]

  navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      width: {
        min: 640,
        max: 1920,
      },
      height: {
        min: 400,
        max: 1080,
      }
    }
  }).then(() => {
    getAllMediaStreams()
    .then(streams => streamSuccess(streams))
    .catch(e => console.error(e));
  })


  // navigator.mediaDevices.enumerateDevices().then((devices) => {
  //   logger("getLocalStream", [SS("devices", devices)]);
  // })
  //   navigator.mediaDevices.getUserMedia({
  //   audio: false,
  //   video: {
  //     width: {
  //       min: 640,
  //       max: 1920,
  //     },
  //     height: {
  //       min: 400,
  //       max: 1080,
  //     }
  //   }
  // })
  // .then(streamSuccess)
  // .catch(error => {
  //   console.log(error.message)
  // })
}

async function getAllMediaStreams(){
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter(device => device.kind == "videoinput");
  logger("getAllMediaStreams", [SS("devices", devices),SS("cameras", cameras) ]);
  const streams = [];
  if (cameras.length > 0) {
    for (const _camera of cameras) {
      const constraints = { deviceId: { exact: _camera.deviceId } };
      const _stream = await navigator.mediaDevices.getUserMedia({ video: constraints });
      logger("getAllMediaStreams", [SS("constraints", constraints),SS("_stream", _stream) ]);
      streams.push(_stream);
    }
      logger("getAllMediaStreams", [SS("streams", streams)]);
      return streams;
  }
}

// const goConsume = () => {
//   goConnect(false)
// }

// const goConnect = (producerOrConsumer) => {
//   isProducer = producerOrConsumer
//   device === undefined ? getRtpCapabilities() : goCreateTransport()
// }

// const goCreateTransport = () => {
//   isProducer ? createSendTransport() : createRecvTransport()
// }

// A device is an endpoint connecting to a Router on the 
// server side to send/recive media
const createDevice = async () => {
  try {
    device = new mediasoupClient.Device()
    logger("createDevice", [SS("mediasoupClient", mediasoupClient) , SS("device", device)]);


    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-load
    // Loads the device with RTP capabilities of the Router (server side)
    await device.load({
      // see getRtpCapabilities() below
      routerRtpCapabilities: rtpCapabilities
    })

    console.log('Device RTP Capabilities', device.rtpCapabilities)

    // once the device loads, create transport
    createSendTransport()

  } catch (error) {
    console.log(error)
    if (error.name === 'UnsupportedError')
      console.warn('browser not supported')
  }
}

// const getRtpCapabilities = () => {
//   // make a request to the server for Router RTP Capabilities
//   // see server's socket.on('getRtpCapabilities', ...)
//   // the server sends back data object which contains rtpCapabilities
//   socket.emit('createRoom', (data) => {
//     console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`)

//     // we assign to local variable and will be used when
//     // loading the client Device (see createDevice above)
//     rtpCapabilities = data.rtpCapabilities

//     // once we have rtpCapabilities from the Router, create Device
//     createDevice()
//   })
// }

const getProducers = () => {
  socket.emit('getProducers', producerIds => {
    console.log(producerIds)
    // for each of the producer create a consumer
    // producerIds.forEach(id => signalNewConsumerTransport(id))
    logger("getProducers", [SS("producerIds", producerIds)]);

    producerIds.forEach(signalNewConsumerTransport)
  })
}

const createSendTransport = () => {
  // see server's socket.on('createWebRtcTransport', sender?, ...)
  // this is a call from Producer, so sender = true
  socket.emit('createWebRtcTransport', { consumer: false }, ({ params }) => {
    logger("createWebRtcTransport", [SS("params", params)]);

    // The server sends back params needed 
    // to create Send Transport on the client side
    if (params.error) {
      console.log(params.error)
      return
    }

    console.log(params)

    // creates a new WebRTC Transport to send media
    // based on the server's producer transport params
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#TransportOptions
    logger("createWebRtcTransport", [SS("producerTransport", producerTransport)]);
    producerTransport = device.createSendTransport(params)
    logger("createWebRtcTransport", [SS("producerTransport", producerTransport)]);

    // https://mediasoup.org/documentation/v3/communication-between-client-and-server/#producing-media
    // this event is raised when a first call to transport.produce() is made
    // see connectSendTransport() below
    producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
    logger("createWebRtcTransport - connect", [SS("connect", dtlsParameters)]);
    try {
        // Signal local DTLS parameters to the server side transport
        // see server's socket.on('transport-connect', ...)
        await socket.emit('transport-connect', {
          dtlsParameters,
        })

        // Tell the transport that parameters were transmitted.
        callback()

      } catch (error) {
        errback(error)
      }
    })

    producerTransport.on('produce', async (parameters, callback, errback) => {
      console.log(parameters)
      logger("createWebRtcTransport - produce", [SS("parameters", parameters)]);

      try {
        // tell the server to create a Producer
        // with the following parameters and produce
        // and expect back a server side producer id
        // see server's socket.on('transport-produce', ...)
        await socket.emit('transport-produce', {
          kind: parameters.kind,
          rtpParameters: parameters.rtpParameters,
          appData: parameters.appData,
        }, ({ id, producersExist }) => {
          // Tell the transport that parameters were transmitted and provide it with the
          // server side producer's id.
          callback({ id })
          logger("createWebRtcTransport - transport-produce", [SS("id", id), SS("producersExist", producersExist)]);


          // if producers exist, then join room
          if (producersExist) getProducers()
        })
      } catch (error) {
        errback(error)
      }
    })

    connectSendTransport()
  })
}

const connectSendTransport = async () => {
  // we now call produce() to instruct the producer transport
  // to send media to the Router
  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
  // this action will trigger the 'connect' and 'produce' events above
  producer = await producerTransport.produce(params)
  logger("connectSendTransport", [SS("params", params)]);
  logger("connectSendTransport", [SS("producer", producer)]);

  producer.on('trackended', () => {
    console.log('track ended')
    logger("connectSendTransport - trackended", [SS("trackended")]);

    // close video track
  })

  producer.on('transportclose', () => {
    console.log('transport ended')
    logger("connectSendTransport - transportclose");

    // close video track
  })
}

const signalNewConsumerTransport = async (remoteProducerId) => {
  //check if we are already consuming the remoteProducerId
  logger("signalNewConsumerTransport", [SS("remoteProducerId", remoteProducerId)]);

  logger("signalNewConsumerTransport", [SS("consumingTransports", consumingTransports)]);
  if (consumingTransports.includes(remoteProducerId)) return;
  consumingTransports.push(remoteProducerId);
  logger("signalNewConsumerTransport", [SS("consumingTransports", consumingTransports)]);

  await socket.emit('createWebRtcTransport', { consumer: true }, ({ params }) => {
  logger("signalNewConsumerTransport - createWebRtcTransport", [SS("params", params)]);

    // The server sends back params needed 
    // to create Send Transport on the client side
    if (params.error) {
      console.log(params.error)
      return
    }
    console.log(`PARAMS... ${params}`)

    let consumerTransport
    try {
      consumerTransport = device.createRecvTransport(params)
  logger("signalNewConsumerTransport", [SS("consumerTransport", consumerTransport)]);

    } catch (error) {
      // exceptions: 
      // {InvalidStateError} if not loaded
      // {TypeError} if wrong arguments.
      console.log(error)
      return
    }

    consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
  logger("signalNewConsumerTransport - connect", [SS("dtlsParameters", dtlsParameters)]);

      try {
        // Signal local DTLS parameters to the server side transport
        // see server's socket.on('transport-recv-connect', ...)
        await socket.emit('transport-recv-connect', {
          dtlsParameters,
          serverConsumerTransportId: params.id,
        })

        // Tell the transport that parameters were transmitted.
        callback()
      } catch (error) {
        // Tell the transport that something was wrong
        errback(error)
      }
    })

    connectRecvTransport(consumerTransport, remoteProducerId, params.id)
  })
}

// server informs the client of a new producer just joined
socket.on('new-producer', ({ producerId }) =>{
  logger("new-producer", [SS("producerId", producerId)]);
  signalNewConsumerTransport(producerId)
} )

const connectRecvTransport = async (consumerTransport, remoteProducerId, serverConsumerTransportId) => {
  logger("connectRecvTransport", [SS("consumerTransport", consumerTransport), SS("remoteProducerId", remoteProducerId), SS("serverConsumerTransportId", serverConsumerTransportId) ]);

  // for consumer, we need to tell the server first
  // to create a consumer based on the rtpCapabilities and consume
  // if the router can consume, it will send back a set of params as below
  await socket.emit('consume', {
    rtpCapabilities: device.rtpCapabilities,
    remoteProducerId,
    serverConsumerTransportId,
  }, async ({ params }) => {
  logger("connectRecvTransport - consume", [SS("params", params)]);

    if (params.error) {
      console.log('Cannot Consume')
      return
    }

    console.log(`Consumer Params ${params}`)
    // then consume with the local consumer transport
    // which creates a consumer
    const consumer = await consumerTransport.consume({
      id: params.id,
      producerId: params.producerId,
      kind: params.kind,
      rtpParameters: params.rtpParameters
    })

  logger("connectRecvTransport", [SS("consumer", consumer)]);


  logger("connectRecvTransport", [SS("consumerTransports", consumerTransports)]);

    consumerTransports = [
      ...consumerTransports,
      {
        consumerTransport,
        serverConsumerTransportId: params.id,
        producerId: remoteProducerId,
        consumer,
      },
    ]

  logger("connectRecvTransport", [SS("consumerTransports", consumerTransports)]);

    // create a new div element for the new consumer media
    // const newElem = document.createElement('div')
    // newElem.setAttribute('id', `td-${remoteProducerId}`)

    // if (params.kind == 'audio') {
    //   //append to the audio container
    //   newElem.innerHTML = '<audio id="' + remoteProducerId + '" autoplay></audio>'
    // } else {
    //   //append to the video container
    //   newElem.setAttribute('class', 'remoteVideo')
    //   newElem.innerHTML = '<video id="' + remoteProducerId + '" autoplay class="video" ></video>'
    // }

    // videoContainer.appendChild(newElem)

    createVideoElement(`${remoteProducerId}`)
    createVideoElement(`${remoteProducerId}_2`)

    // destructure and retrieve the video track from the producer
    const { track } = consumer;
    logger("connectRecvTransport", [SS("-consumer", consumer)]);


    document.getElementById(`${remoteProducerId}`).srcObject = new MediaStream([track])
    // document.getElementById(`${remoteProducerId}_2`).srcObject = new MediaStream([track_2])
    logger("connectRecvTransport", [SS("track", track)]);
    // logger("connectRecvTransport", [SS("track", track),SS("track_2", track_2) ]);

    // the server consumer started with media paused
    // so we need to inform the server to resume
    socket.emit('consumer-resume', { serverConsumerId: params.serverConsumerId })
  })
};

function createVideoElement(id){
  const newElem = document.createElement('div')
    newElem.setAttribute('id', `td-${id}`)

    if (params.kind == 'audio') {
      //append to the audio container
      newElem.innerHTML = '<audio id="' + id + '" autoplay></audio>'
    } else {
      //append to the video container
      newElem.setAttribute('class', 'remoteVideo')
      newElem.innerHTML = '<video id="' + id + '" autoplay class="video" ></video>'
    }

    videoContainer.appendChild(newElem)
}


socket.on('producer-closed', ({ remoteProducerId }) => {
  logger("producer-closed", [SS("remoteProducerId", remoteProducerId)]);

  // server notification is received when a producer is closed
  // we need to close the client-side consumer and associated transport
  logger("producer-closed", [SS("producerToClose", producerToClose)]);
  const producerToClose = consumerTransports.find(transportData => transportData.producerId === remoteProducerId)
  logger("producer-closed", [SS("producerToClose", producerToClose)]);
  producerToClose.consumerTransport.close()
  producerToClose.consumer.close()

  // remove the consumer transport from the list
  consumerTransports = consumerTransports.filter(transportData => transportData.producerId !== remoteProducerId)
  logger("producer-closed", [SS("consumerTransports", consumerTransports)]);

  // remove the video div element
  videoContainer.removeChild(document.getElementById(`td-${remoteProducerId}`))
});