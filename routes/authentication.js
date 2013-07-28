/**
 * Entry point for plugin based routes
 */
exports.init = function(app) {
    /**
     * API Calls
     */
    
    // POST authenticate
    app.post('/authenticate', authenticate);
    
    // POST refresh
    app.post('/refresh', refresh);
    
    // POST invalidate
    app.post('/invalidate', invalidate);
    
    
    /**
     * Implementations
     * Notes:
     * - Profile Id's seem to be constant
     * - Client Id's seen to be generated by the game client (probably computer specific)
     * - 
     */
    var models = app.get('models');
    var crypto = require('crypto');
    
    // Authenticate
    // Receives: { agent : { name : Minecraft , version : 1 } , username : username , password : xxxxxxx , clientToken : XX... }
    // Responds: { accessToken : XX... , clientToken : XX... , selectedProfile : { id : XX... , name : username } , availableProfiles : [ { id : XX... , name : username , ... ] }
    function authenticate(request, response){
        var username = request.body.username;
        var password = request.body.password;
        var clientToken = request.body.clientToken;
        
        // first validate login creds
        models.User.login(username, password, function(user){
            
            // make sure the user has a UUID
            if (user.uuid == null) {
                generateToken(function(token){
                    user.uuid = token;
                    user.save().success(getClients).error(error);
                }, error);
            } else {
                getClients(user);
            }
            
            function getClients(user){
                if (user != null) {
                    // check to see if this user has the client id
                    user.getClients({ where : ['client_token = ?', clientToken]}, [clientToken]).success(function(tokens){
                        if(tokens.length > 0) {
                            console.log("token");
                            // client id already exists
                            generateAccessToken(tokens[0], prepareData, error);
                        } else {
                            console.log("GENGENGENTOKEN");
                            // first time connecting from that computer
                            models.Token.create({client_token : clientToken}).success(function(token){
                                generateAccessToken(token, prepareData, error);
                            }).error(error);
                        }
                    }).error(error); 
                } else {
                    error("Bad Login");
                }
            }
            
            function prepareData(token){
                // make sure token is linked to the user
                user.setClients([token]).success(respond).error(error);
            }
            
            function respond(tokens) {
                var token = tokens[0];
                
                // generate the response message
                var profile = user.jsonProfile();
                var json = {
                    accessToken : token.access_token,
                    clientToken : token.client_token,
                    selectedProfile : profile,
                    availableProfiles : [profile]
                };
                
                // send it off
                response.send(json);
            }
        }, error);
        
        function error(reason) {
            console.log(reason);
            response.send("Bad login");
        }
    }
    
    // Refresh 
    // Receives: { clientToken : XX... , accessToken : XX... }
    // Responds: { accessToken : XX... , clientToken : XX... , selectedProfile : { id : XX... , name : username } }
    function refresh(request, response){
        var clientToken = request.body.clientToken;
        var accessToken = request.body.accessToken;
        
        // retrieve the Token set
        models.Token.find({ where : { client_token : clientToken, access_token : accessToken }}).success(function(token){
            if (token) {
                generateAccessToken(token, function(token){
                    // generate the response message
                    token.getUser().success(function(user){
                        var profile = user.jsonProfile();
                        
                        var json = {
                            accessToken : token.access_token,
                            clientToken : token.client_token,
                            selectedProfile : profile
                        };
                        
                        // send it off
                        response.send(json);
                    });
                }, error); 
            } else {
                error("no token");
            }
        });
        
        function error(reason) {
            // respond with nothing
            console.log(reason);
            response.send("");
        }
    }
    
    // Invalidate
    // Receives: { accessToken : XX... , clientToken : XX... }
    // Responds: Nothing
    function invalidate(request, response){
        var clientToken = request.body.clientToken;
        var accessToken = request.body.accessToken;
        
        // retrieve the Token set
        models.Token.find({ where : { client_token : clientToken, access_token : accessToken }}).success(function(token){
            if (token) {
                token.destroy().error(function(){
                    console.log("Could Not Delete Token");
                });
            }
            
            response.send('');
        });
    }
    
    /**
     * Utility Functions
     */
    function generateAccessToken(token, callback, errorback) {
        generateToken(function(tokenString) {
            token.access_token = tokenString;
            token.save().success(callback).error(errorback);
        });
    }
    
    function generateToken(callback, errorback) {
        crypto.randomBytes(16, function(ex, buf) {
            if (ex) {
                errorback(ex);
            } else {
                var token = buf.toString('hex');
                callback(token);
            }
        });
    }
}
