//This code is a modified Version of the original Serial Port Node for Node RED (Apache 2.0) from Dave Conway-Jones


module.exports = function(RED)
{
    "use strict"; //Java script Mode bei dem unter anderem alle Varialblen deklariert sein müssen

    var settings = RED.settings;
    var events = require("events");
    var serialp = require("serialport")
    var bufMaxSize = 50;

//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++  serial_port Node replaces serial port Node of the original Serial Node RED Package.

      function SerialPortNode(n) {
        RED.nodes.createNode(this,n);
        this.serialport = n.serialport;
        this.newline = n.newline;
        this.addchar = n.addchar || "false";
        this.serialbaud = parseInt(n.serialbaud) || 57600;
        this.databits = parseInt(n.databits) || 8;
        this.parity = n.parity || "none";
        this.stopbits = parseInt(n.stopbits) || 1; 
        this.bin = n.bin || "msp";
        this.out = n.out || "msp";
    }
    RED.nodes.registerType("serial_port",SerialPortNode);


//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++


    function MspOutNode(n) //MspOut Node replaces the SerialOutNode of the original Serial Node RED Package.
    {
	RED.nodes.createNode(this,n);
	this.serial = n.serial;
    this.serialConfig = RED.nodes.getNode(this.serial);
    
    if(this.serialConfig)
    {
        var node = this;
        node.port = serialPool.get(this.serialConfig.serialport,
        this.serialConfig.serialbaud,
        this.serialConfig.databits,
        this.serialConfig.parity,
        this.serialConfig.stopbits,
        this.serialConfig.newline);
		
        var datalengh = 5;// 2x<preamble>,<direction>,<size>,<command>,Anzahl der Datenbytes wird mit Data berechnet,<crc>  
		
		
		const preamble = Buffer.from([36,77]); //Preamble Asci $M
		const direction = {toFC : 60,  fromFC: 62};  //< toFC     > fromFC
		const directionpos	= 	0;
		const sizepos 		=	1; 
		const commandpos	=	2;
		
       node.on("input",function(msg){     
			
		var messagedata = Buffer.alloc(3); //Buffer für direction[0], size[1], command [2]
		var crc = Buffer.from([0]);
			
          if(msg.hasOwnProperty('direction') && (msg.direction == direction.toFC || msg.direction == direction.fromFC ))
		   {
				messagedata[0] 	=	msg.direction;
		   }
		   else
		   {
				messagedata[0] 	= 	60;
		   }
		   
		   if(msg.hasOwnProperty('size') && (msg.size > 0 && msg.size < 256))  //255 is the maximum of dies Value
		   {
				messagedata[1]	=	msg.size; 
		   }
		   else
		   {
				messagedata[1]	=	0;
		   }
		   
		   if(msg.hasOwnProperty('command') && (msg.command >= 0 && msg.command < 256)) //255 is the maximum of this Value
		   {
				messagedata[2]	=	msg.command;
		   }
		   else
		   {
				messagedata[2]	=	1;
		   }
		   
			datalengh += messagedata[1];
		    crc[0] = messagedata[1] ^ messagedata[2];
		   
		   //todo: check ob size gleich groß wie datenbuffer
		   
		   if(msg.hasOwnProperty('data') && messagedata[1]	>	0)  //messagedata 1 beinhaltet size 
		   {
			   var data = Buffer.alloc(messagedata[1]);
				for(var i = 0; i < messagedata[1]; i++) 
				{
					crc[0] ^= msg.data[i];
					data[i] = msg.data[i];
				}
				
				var mspmessage = Buffer.concat([preamble,messagedata,data,crc])
		   }
		   else
		   {
			   var mspmessage = Buffer.concat([preamble,messagedata,crc])
			   
		   }
		  
           
			//var mspmessage = Buffer.from([36,77,60,0,1,1]);  //MSP Message command 1
             node.port.write(mspmessage,function(err,res) {
                        if (err) {
                            var errmsg = err.toString().replace("Serialport","Serialport "+node.port.serial.path);
                            node.error(errmsg,msg);
                        }
              });
   
    
    
    });
    
      node.port.on('ready', function() {
                node.status({fill:"green",shape:"dot",text:"node-red:common.status.connected"});
            });
            node.port.on('closed', function() {
                node.status({fill:"red",shape:"ring",text:"node-red:common.status.not-connected"});
            });
    
    }
    
    else {
            this.error(RED._("serial.errors.missing-conf"));
        }

        this.on('close', function(done) {
            if (this.serialConfig) {
                serialPool.close(this.serialConfig.serialport,done);
            }
            else {
                done();
            }
        });  
 
    }
     RED.nodes.registerType("MspOut", MspOutNode )

//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++

    function MspInNode(n)  //MspIn Node replaces the SerialInNode of the original Serial Node RED Package.
    {RED.nodes.createNode(this,n);
     RED.nodes.createNode(this,n);
        this.serial = n.serial;
        this.serialConfig = RED.nodes.getNode(this.serial);

      if (this.serialConfig) {
            var node = this;
            node.tout = null;
            var buf = new Buffer(bufMaxSize);
            var i = 0;
			const sizeposition = 3; //Position des Size Bytes
			const dataposition = 5;  //Position des ERSTEN Daten Bytes
			const commandposition = 4; //Position des Command Bytes
			var crcposition = 5; //Position des CRC Bytes
            var datalengh = 5;// 2x<preamble>,<direction>,<size>,<command>,Anzahl der Datenbytes wird mit Data berechnet,<crc>  
			var mspfinish = false //Übertragung fertig true, sonst fals
			var crc = 0;
            node.status({fill:"grey",shape:"dot",text:"node-red:common.status.not-connected"});
            node.port = serialPool.get(this.serialConfig.serialport,
                this.serialConfig.serialbaud,
                this.serialConfig.databits,
                this.serialConfig.parity,
                this.serialConfig.stopbits,
                this.serialConfig.newline);
                
                this.port.on('data', function(msg)
                {
					
                    if(i < datalengh) //zähle daten in buffer
                    {   buf[i] = msg;
                        
						if(i > 2)//crc = xor of all bytes from size beginning
						{
							crc ^= msg;
							
						}
						
                        if(i == sizeposition)  //sizebyte an 3 stelle gibt an wieviele daten bytes im Paket enthalten sind      
                        {
                            //var sizevalue = new Uint8Array(1);
                            //sizevalue[1] = buf[i];
                            //imax += Number(sizevalue[1]); 
							datalengh += buf[i];
							crcposition = datalengh;
                        }
						
                        
                        
                    }
                    else//wenn alle daten da sind als payload weitergeben
                    {
						buf[i] = msg;
						crc ^= msg; //calculatet crc XOR with Message crc must be 0
						//CRC Prüfung
																		
						/************************spliten**************************************
						
						Daten werden in Ausgabeobjekt outputmsp in eingeschaften getrennt gespeichert.
						
						Eigenschaften:
						binarymessage --> alle Daten der MSP Nachricht 
						binarycommand --> command Byte der MSP Nachricht
						binarydirection --> direction Byte der MSP Nachricht
						
						++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++*/
                        var binarymessage = Buffer.alloc(i+1); //komplette Binäre nachricht
						buf.copy(binarymessage,0,0,i+1); 
						
						var binarycommand = buf[commandposition];//enthält MSP komando 
						
						
						
						
						if(buf[sizeposition] == 0) //keine Daten, nur Befehl
						{	
							var outputmsg = {payload : binarymessage, topic : binarycommand, command : binarycommand, direction : binarymessage[2]};
						}
						else //Nachricht mit Daten
						{  
							var binarydata = Buffer.alloc(datalengh - 5);
							buf.copy(binarydata,0,5,datalengh);
							
							
							var outputmsg = {payload : binarymessage, command : binarycommand, direction : binarymessage[2] ,topic : binarycommand, data : binarydata};
							binarydata = null;
						
						}
						
						
						mspfinish = true;
						
						//Ausgebent
                        if(!crc)node.send(outputmsg);
											
					//Obekte und Variablen zurücksetzen
						outputmsg={};
                       binarymessage = null;
					   binarycommand = null;
                        i = 0;
                        datalengh = 5; //datenlänge wieder auf 5 stellen
						crc = 0;
					
                        
                    }
					if(!mspfinish)
					{i++;
						if((i == 1 && buf[i-1] != 36)||(i == 2 && buf[i-1] != 77)) i = 0; //warte auf preamble
					}
					else mspfinish = false;
					
					
            
                 });
            this.port.on('ready', function() {
                node.status({fill:"green",shape:"dot",text:"node-red:common.status.connected"});
            });
            this.port.on('closed', function() {
                node.status({fill:"red",shape:"ring",text:"node-red:common.status.not-connected"});
            });
                
                
      }
      else {
            this.error(RED._("serial.errors.missing-conf"));
        }

        this.on("close", function(done) {
            if (this.serialConfig) {
                serialPool.close(this.serialConfig.serialport,done);
            }
            else {
                done();
            }
        });
    }
    RED.nodes.registerType("MspIn", MspInNode )
        
//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++

      var serialPool = (function() {
        var connections = {};
        return {
            get:function(port,baud,databits,parity,stopbits,newline,callback) {
                var id = port;
                if (!connections[id]) {
                    connections[id] = (function() {
                        var obj = {
                            _emitter: new events.EventEmitter(),
                            serial: null,
                            _closing: false,
                            tout: null,
                            on: function(a,b) { this._emitter.on(a,b); },
                            close: function(cb) { this.serial.close(cb); },
                            write: function(m,cb) { this.serial.write(m,cb); },
                        }
                        //newline = newline.replace("\\n","\n").replace("\\r","\r");
                        var olderr = "";
                        var setupSerial = function() {
                            obj.serial = new serialp(port,{
                                baudRate: baud,
                                dataBits: databits,
                                parity: parity,
                                stopBits: stopbits,
                                //parser: serialp.parsers.raw,
                                autoOpen: true
                            }, function(err, results) {
                                if (err) {
                                    if (err.toString() !== olderr) {
                                        olderr = err.toString();
                                        RED.log.error(RED._("serial.errors.error",{port:port,error:olderr}));
                                    }
                                    obj.tout = setTimeout(function() {
                                        setupSerial();
                                    }, settings.serialReconnectTime);
                                }
                            });
                            obj.serial.on('error', function(err) {
                                RED.log.error(RED._("serial.errors.error",{port:port,error:err.toString()}));
                                obj._emitter.emit('closed');
                                obj.tout = setTimeout(function() {
                                    setupSerial();
                                }, settings.serialReconnectTime);
                            });
                            obj.serial.on('close', function() {
                                if (!obj._closing) {
                                    RED.log.error(RED._("serial.errors.unexpected-close",{port:port}));
                                    obj._emitter.emit('closed');
                                    obj.tout = setTimeout(function() {
                                        setupSerial();
                                    }, settings.serialReconnectTime);
                                }
                            });
                            obj.serial.on('open',function() {
                                olderr = "";
                                RED.log.info(RED._("serial.onopen",{port:port,baud:baud,config: databits+""+parity.charAt(0).toUpperCase()+stopbits}));
                                if (obj.tout) { clearTimeout(obj.tout); }
                                //obj.serial.flush();
                                obj._emitter.emit('ready');
                            });
                            obj.serial.on('data',function(d) {
                                for (var z=0; z<d.length; z++) {
                                    obj._emitter.emit('data',d[z]);
                                }
                            });
                            // obj.serial.on("disconnect",function() {
                            //     RED.log.error(RED._("serial.errors.disconnected",{port:port}));
                            // });
                        }
                        setupSerial();
                        return obj;
                    }());
                }
                return connections[id];
            },
            close: function(port,done) {
                if (connections[port]) {
                    if (connections[port].tout != null) {
                        clearTimeout(connections[port].tout);
                    }
                    connections[port]._closing = true;
                    try {
                        connections[port].close(function() {
                            RED.log.info(RED._("serial.errors.closed",{port:port}));
                            done();
                        });
                    }
                    catch(err) { }
                    delete connections[port];
                }
                else {
                    done();
                }
            }
        }
    }());

    RED.httpAdmin.get("/serialports", RED.auth.needsPermission('serial.read'), function(req,res) {
        serialp.list(function (err, ports) {
            res.json(ports);
        });
    });
}