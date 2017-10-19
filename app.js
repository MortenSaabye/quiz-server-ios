const server = require('http').createServer();

const io = require('socket.io')(server)


const numberOfPlayers = 3
const pointsToWin = 5

io.on('connect', onConnect)


let channels = []
function getChannel(clientData) {
   return io.sockets.adapter.rooms[clientData.channel]
}

function onConnect(socket) {
   let clientData = socketInit(socket)
   
   socket.on('join', (name) => onJoin(clientData, name))
   socket.on('subscribe', (channel) => onSubscribe(clientData, channel))
   socket.on('ready', () => onReady(clientData))
   socket.on('question', (question, answers, correctAnswer) => onQuestion(clientData, question, answers, correctAnswer))
   socket.on('nextRound', () => onNextRound(clientData))
   socket.on('answer', (guess) => onAnswer(clientData, guess))

   socket.on('restart', () => {
      subscribeToChannel(clientData)
   })

   socket.on('leaveChannel', () => {
      socket.leave(clientData.channel)
   })

   socket.on('disconnect', () => onDisconnect(clientData))
}

server.listen(3000)

console.log('server is listening on port 3000')

function subscribeToChannel(clientData) {
   channelKeys = Object.keys(io.sockets.adapter.rooms)
   channels = []
   var name
   channelKeys.forEach(channel => {
      name = io.sockets.adapter.rooms[channel].subscribers.find(sub => sub.isModerator).name
      channels.push({channel: channel, name: name})
   })
   clientData.socket.emit('selectChannel', channels)
}

function onNextRound(clientData){
   clientData.socket.to(clientData.channel).emit('nextQuestion')
}

function handleSubscribersAndChannel(clientData) {
   clientData.socket.join(clientData.channel)
   console.log(`${clientData.name} has joined ${clientData.channel}`)
   clientData.socket.to(clientData.channel).emit('newPlayer', clientData.name)
   if (getChannel(clientData).subscribers === undefined) {
      getChannel(clientData).subscribers = [{name: clientData.name, isModerator: true, id: clientData.socket.id}]
      getChannel(clientData).moderatorId = clientData.socket.id
      clientData.isModerator = true
      clientData.index = 0
      clientData.socket.broadcast.emit('newChannel', {channel: clientData.channel, name: clientData.name})
   } else {
      clientData.index = getChannel(clientData).subscribers.length
      clientData.isModerator = false
      getChannel(clientData).subscribers.push({ name: clientData.name, isModerator: false, points: 0, id: clientData.socket.id})
   }
   
   let subscribers = [...getChannel(clientData).subscribers]
   var ready = false
   if (getChannel(clientData).subscribers.length >= numberOfPlayers + 1) {
      ready = true
   }
   clientData.socket.emit('joinSucces', subscribers, numberOfPlayers, pointsToWin, { name: clientData.name, id: clientData.socket.id, isModerator: clientData.isModerator }, ready) 
}

function onReady(clientData){
   let subscribers = [...getChannel(clientData).subscribers]
   io.in(clientData.channel).emit('startGame', subscribers)
}

function socketInit(socket) {
   let clientData = {
      name: "Anonomous",
      channel: String,
      index: Number,
      isModerator: false,
      socket: socket
   }
   socket.leave(Object.keys(io.sockets.adapter.rooms)[Object.keys(io.sockets.adapter.rooms).length - 1])
   socket.emit('succes', "You have been connected.")
   return clientData
}

function onJoin(clientData, name) {
   clientData.name = name
   console.log(`${name} has connected`)
   subscribeToChannel(clientData)
}

function onSubscribe(clientData, channel) {
   console.log(channel)
   clientData.channel = channel["channel"]
   handleSubscribersAndChannel(clientData)
}

function onQuestion(clientData, question, answers, correctAnswer) {
   getChannel(clientData).currentAnswer = Number(correctAnswer)
   console.log(correctAnswer)
   getChannel(clientData).isWaitingForAnswer = true
   getChannel(clientData).wrongAnswers = 0
   io.in(clientData.channel).emit('question', question, answers, correctAnswer)
}

function onAnswer(clientData, guess) {
   let answer = getChannel(clientData).currentAnswer
   if (Number(guess) === answer) {
      getChannel(clientData).isWaitingForAnswer = false
      getChannel(clientData).subscribers[clientData.index].points++
      io.in(clientData.channel).emit('questionAnswered', clientData.socket.id)
      let highScore = getChannel(clientData).subscribers.sort((a, b) => { return Number(b.points) - Number(a.points) })[1].points
      console.log(`highScore: ${highScore}`)
      if (highScore >= pointsToWin) {
         gameOver(clientData)
         return
      }
   } else {
      getChannel(clientData).wrongAnswers++
      clientData.socket.emit('wrong')
   }
   if (getChannel(clientData).wrongAnswers >= getChannel(clientData).subscribers.length - 1) {
      console.log('event')
      io.in(clientData.channel).emit('allWrong')
   }
}

function gameOver(clientData) {
   io.in(clientData.channel).emit('announceWinner', clientData.socket.id)
   io.in(clientData.channel).clients((err, clients) => {
      clients.forEach(socketID => io.sockets.connected[socketID].leave(clientData.channel))
   })
}

function onDisconnect(clientData) {
   if (clientData.isModerator) {
      io.emit('destroyed', clientData.channel)
      io.in(clientData.channel).clients((err, clients) => {
         clients.forEach(socketID => io.sockets.connected[socketID].leave(clientData.channel))
      })
      console.log(`${clientData.channel} is destroyed`)
   } else if (getChannel(clientData)) {
      console.log(`${clientData.name} disconnected ${clientData.channel}`)
      let index = getChannel(clientData).subscribers.findIndex(sub => { sub.name === clientData.name })
      getChannel(clientData).subscribers.splice(index, 1)
      io.to(clientData.channel).emit('disconnection', clientData.name)
      
   } else {
      console.log(`${clientData.name} left the game.`)
   }
}