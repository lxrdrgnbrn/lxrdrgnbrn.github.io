const config = require('./config.json')

const host = config.ServerCfg.host
const port = config.ServerCfg.port 

const express = require('express')
const http = require('http')
const path = require('path')
const socketIO = require('socket.io')
const { rootCertificates } = require('tls')
const { findSourceMap } = require('module')
const { log } = require('console')

const app = express()
const server = http.Server(app);
app.use('/static', express.static(__dirname + '/static'))

var options = {
  cors:{
    origins: 'http://127.0.0.1:3000',
    transports: ['websocket', 'polling', 'flashsocket']
  }
}

const io = require('socket.io')(server, options)

// Routing for test lobby 
app.get('/', function(request, response) {
    response.json({"response": "Hello world!"})
});

server.listen(port, host, function(){
    return console.log('\033[95mServer listens \033[96m'+`http://${host}:${port}` + '\033[0m')
})

function Player (id) {
  this.id = id;
  this.name = null;
  this.room = null;
  this.entity = null;
}
var players = {}

function Room (idRootPlayer){
  this.id = idRootPlayer
  this.closedRoom = false;
  this.players = {};
  this.numbOfPlayers = 0;
}

var rooms = {}

function Squeres (idRoom){
  this.id = idRoom;
  this.units = {}
}

squeres = {}

function Unit(idUn ,idPlayer){
  this.id = idUn
  this.idPlayer = idPlayer
  this.points = 10
}


io.on('connection', function(socket) {


  socket.on ('initialize', function () {
      var id = socket.id;
      
      console.log("Connection Player: id - " + "\033[96m" + id + "\033[0m")

      var newPlayer = new Player(id)
      players[id] = newPlayer

      socket.emit('initializeStatus', {'status': 'ok'})
      socket.emit('sendPlayerData', players[id])
  });

  socket.on('CreateRoom', function(playerData){
    if (playerData.room == null){
      console.log('request to create a lobby from player: ' + playerData.id)

      // create new room and add root player in lobby
      createNewRoom(socket, playerData)
    }else {
      socket.emit('consoleLog', 'Error: You are already in the lobby');
    }
  })

  socket.on('GetDataLobby', function(playerData){
    console.log(playerData);
    socket.emit('setDataLooby', rooms[playerData.room])
    console.log('The room data has been sent.')
  })

  socket.on('EnterARandomGame', function(playerData){
    if (playerData.room == null){
      // check if there are rooms
      let totalRooms = Object.keys(rooms).length
      console.log('Total rooms: ', totalRooms)

      if (totalRooms != 0){
        //sorting through all the rooms
        for(key in rooms){
          if ((rooms[key].numbOfPlayers < 4) && (rooms[key].closedRoom != true)){
            // if there are places in the room and it is not closed, we perform the entrance
            console.log('Room found: ' + key)
            players[playerData.id].room = rooms[key].id
            rooms[key].players[rooms[key].numbOfPlayers] = players[playerData.id];
            rooms[key].numbOfPlayers++
            
            console.log('The player entered the room. IdRoom:'+ rooms[key].id)
            // we transmit the data about to the client
            socket.emit('setDataLooby', rooms[key])
            console.log('The room data has been sent.')
            // console.log(rooms[key])
            console.log('Socket join Room: ' + rooms[key].id)
            socket.join(rooms[key].id)
            socket.emit('consoleLog', 'The player entered the room. \nIdRoom: ' + rooms[key].id)
            socket.to(rooms[key].id).emit('setDataLooby', rooms[key])
            socket.to(rooms[key].id).emit('consoleLog', 'the player entered the room. idPlayer:' + playerData.id)
            break
          }
          else
          {
            // if all the rooms are full
            createNewRoom(socket, playerData)
          }
        }
      } 
      else if(totalRooms == 0)
      {
        // if there are no rooms, then create a new one and give the root role
        createNewRoom(socket, playerData)
      }
    }
    else 
    {
      socket.emit('consoleLog', 'Error: You are already in the lobby');
    }
  })




  socket.on('ExitTheRoom', function(playerData){
    if (playerData.room != null){
      var chengeRoom = rooms[playerData.room]
      console.log(rooms[playerData.room])

      if(chengeRoom.numbOfPlayers == 1){
        console.log('delete room: id '+ chengeRoom.id)
        delete rooms[chengeRoom.id] 
        chengeRoom = null
      } 
      else if(chengeRoom.numbOfPlayers > 1){

        for(key in chengeRoom.players){
          if(chengeRoom.players[key].id == playerData.id){
            delete chengeRoom.players[key]
          }
        }
    
        chengeRoom.numbOfPlayers--
    
        var new_key = 0
        for(key in chengeRoom.players){
          if (key !== new_key){
            Object.defineProperty(chengeRoom.players, new_key,
              Object.getOwnPropertyDescriptor(chengeRoom.players, key));
            delete chengeRoom.players[key];
          }
          new_key++
        }
    
        if (playerData.id == chengeRoom.id){
          chengeRoom.id = chengeRoom.players[0].id
          for(key in chengeRoom.players){
            chengeRoom.players[key].room = chengeRoom.players[0].id
          }
        }
        
        rooms[playerData.room] = chengeRoom;
        console.log('modified room: ')
        console.log(rooms[playerData.room]);

        //socket.to(playerData.room).emit('SocketUpdt', rooms[playerData.room].id)
      }

      players[playerData.id].room = null
      socket.emit('sendPlayerData', players[playerData.id])
      socket.emit('closeRoomWindow')
      console.log('The player left the room: idPlayer: ' + players[playerData.id].id)
      socket.emit('consoleLog', "You left the room")
      console.log('sadadsadasda   ' + playerData.room)
      socket.leave(playerData.room)
      io.to(playerData.room).emit('consoleLog', 'player exit. \nidPlayer' + playerData.id)
      io.to(playerData.room).emit('setDataLooby', rooms[playerData.room])
    }else{
      socket.emit('consoleLog', 'Error: youre not in the lobby')
    }
  })

  socket.on('ClientDisconnect', function(playerData){
    delete players[playerData.id]
    console.log('PlayerDisconnect. idPlayer: ' + playerData.id);
  })

  socket.on("StartGame", function(socketId){
    squeres[socketId] = new Squeres(socketId)
    squeres[socketId].units[1] = new Unit(1, rooms[socketId].players[0]) 
    squeres[socketId].units[2] = new Unit(2, rooms[socketId].players[1])

    io.to(socketId).emit('StartingGame')
    setInterval(function(){
      squeres[socketId].units[1].points++;
      squeres[socketId].units[2].points++;  

      io.to(socketId).emit('AddPoint', squeres[socketId])
  }, 1000);
  })

  socket.on("Attack", function(socketId, data){
    //From, to, count
    console.log(squeres[socketId], data)
    var from = data[0];
    var to = data[1];

    
    //squeres[socketId] = new Squeres(socketId)

    /*
    squeres[socketId] = new Squeres(socketId)
    squeres[socketId].units[1] = new Unit(1, rooms[socketId].players[0]) 
    squeres[socketId].units[2] = new Unit(2, rooms[socketId].players[1])

    io.to(socketId).emit('StartingGame')
    setInterval(function(){
      squeres[socketId].units[1].points++;
      squeres[socketId].units[2].points++;  

      io.to(socketId).emit('AddPoint', squeres[socketId])
  }, 1000);*/
  })


})

function createNewRoom(socket, playerData){
  
  var newRoom = new Room(playerData.id)
  newRoom.players[0] = players[playerData.id]
  newRoom.numbOfPlayers++
  rooms[playerData.id] = newRoom

  players[playerData.id].room = newRoom.id

  console.log('Rooms info:');
  console.log(rooms[playerData.id])

  console.log('\033[92mThe room has been created. idRoom: \033[0m' + newRoom.id)

  socket.emit('CreateRoomStatus', {'status': 'ok', 'roomId': newRoom.id})
  console.log('socket: ' + playerData.id)
  socket.join(playerData.id)
}