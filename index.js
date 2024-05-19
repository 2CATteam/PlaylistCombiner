const express = require('express')
const app = express()
var expressWs = require('express-ws')(app);
app.set('view engine', 'pug')

app.get('/', function (req, res) {
  res.send('Hello World')
})

app.ws('/echo', function(ws, req) {
    ws.on('message', function(msg) {
      ws.send(msg);
    });
});

app.listen(3000)