//login check in email (ok)
//password hash not start (ok)
//nosql injection not start
//chatroom encrpty not start(ok)

var mongojs = require('mongojs');
var db = mongojs('localhost:27017/eClassroom', ['account']);

var express = require('express');
var app = express();
var serv = require('http').Server(app);
var bodyParser = require('body-parser');
var cryptoJs = require('crypto-js');
const nodemailer = require("nodemailer");
var cookie = require('cookie-parser');
var JSEncrypt = require('node-jsencrypt');
var forge = require('node-forge');
var NodeRSA = require('node-rsa');
var fs = require('fs');

var accessCount = 0;
var io = require('socket.io')(serv, {});

console.log('Server started.');

var PAIR_KEY_LIST= {};
var SOCKET_LIST = {};
var LOGIN_AUTH_LIST ={};
var NONCE_LIST = {};


app.use('/client/img', express.static(__dirname + '/client/img'));
// for the login
app.get('/', function(req, res) {
    res.cookie("accessCount", accessCount),{ maxAge: 600000, httpOnly: true };
    keyGenerator();
    res.cookie('prk', PAIR_KEY_LIST[accessCount-1].public),{ maxAge: 600000, httpOnly: true };
    res.sendFile(__dirname + '/client/login.html');
});

var isUser = function(loginId, loginPw, cb) {
    db.account.find({id:loginId}, function(err, res){ //check if user id exist
        if(res.length == 1){
            attempt_time = res[0].attempt;
            loginPw = pwToHash(loginPw, res[0].salt);
            db.account.find({id:loginId, password:loginPw}, function(err, res) {
                if(attempt_time > 3){
                    cb('2');
                }
                else if(res.length > 0){
                    attempt_time = 0;
                    modifyDbValue(loginId, attempt_time);
                    cb('1');
                }
                else{
                    attempt_time++;
                    modifyDbValue(loginId, attempt_time);
                    cb('0');
                }
            });
        }
        else{
            cb('0');
        }
    })
}

app.post('/login', bodyParser.urlencoded({extended:false}), function(req, res){
    var loginId = req.body.userId;
    var loginPw = req.body.password;
    loginPw = keyDecrypt(req.body.accessCount, loginPw);
    isUser(loginId, loginPw, function(result) {
        if(result === '1'){ //if correct id and password

            login_auth = Math.floor(Math.random() * 10000);
            LOGIN_AUTH_LIST[loginId] = login_auth;
            db.account.find({id:loginId},function(err, result)
            {
                //send email to user
                let testAccount = nodemailer.createTestAccount();
                // create reusable transporter object using the default SMTP transport
                let transporter = nodemailer.createTransport({
                    service:'zoho',
                    secure: false, // true for 465, false for other ports
                    auth: {
                    user: "cssproject123@zohomail.com", // generated ethereal user
                    pass: "aSHizSvFfj4W", // generated ethereal password
                    },
                });
                
                // send mail with defined transport object
                let info = transporter.sendMail({
                    from: '"cssproject123@zohomail.com', // sender address
                    to: result[0].gmail, // list of receivers
                    subject: "Your authentication code", // Subject line
                    html: "<b>Your authentication code is " + login_auth +"</b>", // html body
                });
                res.sendFile(__dirname + '/client/auth.html');
                
            });
            
        }
        else if(result === '0'){ // if wrong id or password

            fs.readFile(__dirname+'/client/login.html', function(err, data){
                res.writeHead(200, {'Content-Type': 'text/html'});
                res.write(data);
                res.write('<p>Wrong ID or password</p>');
                return res.end();
            });
        
        }
        else{ // if too many attempt
            fs.readFile(__dirname+'/client/login.html', function(err, data){
                res.writeHead(200, {'Content-Type': 'text/html'});
                res.write(data);
                res.write('<p>You have tried too many times, contact the manager to unlook it.</p>');
                return res.end();
            });
        }
    });
    
});

app.post('/auth', bodyParser.urlencoded({extended:false}), function(req, res){
    
    var authCode = req.body.authCode;
    var authId = req.body.authId;
    if(authCode == LOGIN_AUTH_LIST[authId]){//auth ok
        res.cookie('id', authId), { maxAge: 600000, httpOnly: true };

        delete LOGIN_AUTH_LIST[authId];

        res.sendFile(__dirname + "/client/game.html");
    }
    else{
        res.sendFile(__dirname + '/client/login.html');
    }
    
});

//for the game

io.sockets.on('connection', function(socket){

    //once client send the first emit

    socket.on('connectToGame', function(data){
        var clientId = data;
        socket.id = clientId;
        console.log(clientId + ' socket connected');
        SOCKET_LIST[clientId] = socket;
        NONCE_LIST[clientId] = generateNonce();
        Player.onConnect(socket, clientId, NONCE_LIST[clientId]);
    })
    
    socket.on('disconnect', function() {
        delete SOCKET_LIST[socket.id];
        Player.onDisconnect(socket);
    });
    
})



var User = function() {
    var self = {
        x:250,
        y:250,
        id: "",
        pressUp:false,
        pressDown:false,
        pressLeft:false,
        pressRight:false,
        direction: 'right',
    }

    self.updatePosition = function () {
        if(self.pressUp && self.y > 10){
            self.y -= 10;
        }
        if(self.pressDown && self.y < 293){
            self.y += 10;
        }
        if(self.pressLeft && self.x > 20){
            self.x -= 10;
        }
        if(self.pressRight && self.x < 912){
            self.x += 10;
        }
    }

    return self;
}

var Player = function(id) {
    var self = User();
    self.id = id;
    self.handUp = false;
    Player.list[id] = self;
    return self;
}

Player.list = {};
Player.onConnect = function(socket, studentId, theNonce){
    var player = Player(socket.id);
    socket.emit('giveNonce', theNonce);
    socket.on('keyPress', function(data){
        if(data.inputIs == 'up'){
            player.pressUp = data.state;
        }
        else if(data.inputIs == 'down'){
            player.pressDown = data.state;
        }
        else if(data.inputIs == 'left'){
            player.pressLeft = data.state;
            player.direction = 'left';
        }
        else if(data.inputIs == 'right'){
            player.pressRight = data.state;
            player.direction = 'right';
        }
        else if(data.inputIs == 'handUp'){
            player.handUp = data.state;
        }
        player.updatePosition();
    });

    socket.on('addComment', function(data) {
        var deMsg = decryptMsg(data, NONCE_LIST[socket.id]);
        reciveComment = studentId + ": " + deMsg;
        for(var i in SOCKET_LIST){
            var msg = encryptMsg(reciveComment, NONCE_LIST[i]);
            SOCKET_LIST[i].emit('addToChat', msg);
        }
        
    });
}

Player.onDisconnect = function(socket) {
    delete Player.list[socket.id];
}


Player.update = function() {
    var pack = [];
    for(var i in Player.list){
        
        var player = Player.list[i];
        pack.push({
            id: player.id,
            x: player.x,
            y:player.y,
            handUp: player.handUp,
            direction:player.direction,
        });
    }
    return pack;
}


var modifyDbValue = function(id, attempt_time){
    db.account.findAndModify({
        query:{id:id},
        update:{$set:{attempt: attempt_time}},
        new:true,
    }, function (err, res, lastErrorObject) {
    });
}

var decryptMsg = function(encryedPass, theNonce){
    var byte = cryptoJs.AES.decrypt(encryedPass, theNonce);
    var msg = byte.toString(cryptoJs.enc.Utf8);
    return msg;
}

var generateNonce = function(){
    return cryptoJs.lib.WordArray.random(12).toString();
}

var encryptMsg = function(msg, theNonce){
    return cryptoJs.AES.encrypt(msg, theNonce).toString();
}

var pwToHash = function(oriPw, salt) {
    var ppp = oriPw+salt;
    var hhh = cryptoJs.SHA256(ppp).toString();
    return hhh;
}

var keyGenerator = function(){
    const key = new NodeRSA({b: 1024});
    key.generateKeyPair(1024);
    PAIR_KEY_LIST[accessCount] = {public: key.exportKey('pkcs8-public-pem'), private:key.exportKey('pkcs1-private-pem')};
    accessCount++;
}

var keyDecrypt = function(num, msg){
    const jsEncrypt = new JSEncrypt();
    var decrypted = jsEncrypt.setPrivateKey(PAIR_KEY_LIST[num].private);
    return jsEncrypt.decrypt(msg);
}



serv.listen(2000);
setInterval(function() {
    var pack = Player.update();

    for(var i in SOCKET_LIST){
        var socket = SOCKET_LIST[i];
        socket.emit('newPositions', pack)
    }
}, 1000/25);