//=========================================================================
// minimalist DOM helpers
//=========================================================================

var Dom = {

  get:  function(id)                     { return ((id instanceof HTMLElement) || (id === document)) ? id : document.getElementById(id); },
  set:  function(id, html)               { Dom.get(id).innerHTML = html;                        },
  on:   function(ele, type, fn, capture) { Dom.get(ele).addEventListener(type, fn, capture);    },
  un:   function(ele, type, fn, capture) { Dom.get(ele).removeEventListener(type, fn, capture); },
  show: function(ele, type)              { Dom.get(ele).style.display = (type || 'block');      },
  blur: function(ev)                     { ev.target.blur();                                    },

  addClassName:    function(ele, name)     { Dom.toggleClassName(ele, name, true);  },
  removeClassName: function(ele, name)     { Dom.toggleClassName(ele, name, false); },
  toggleClassName: function(ele, name, on) {
    ele = Dom.get(ele);
    var classes = ele.className.split(' ');
    var n = classes.indexOf(name);
    on = (typeof on == 'undefined') ? (n < 0) : on;
    if (on && (n < 0))
      classes.push(name);
    else if (!on && (n >= 0))
      classes.splice(n, 1);
    ele.className = classes.join(' ');
  },

  storage: window.localStorage || {}

}

//=========================================================================
// general purpose helpers (mostly math)
//=========================================================================
var wheelFrame = 1;
var flagtick = 0;
var crashtick = 0;
var rainTick  = 0;
var crashgravity = -1;
var crashforce = 35;
var gameOverTick = 0;
var tireY    = 0;
var steering = 0;

var Util = {

  timestamp:        function()                  { return new Date().getTime();                                    },
  toInt:            function(obj, def)          { if (obj !== null) { var x = parseInt(obj, 10); if (!isNaN(x)) return x; } return Util.toInt(def, 0); },
  toFloat:          function(obj, def)          { if (obj !== null) { var x = parseFloat(obj);   if (!isNaN(x)) return x; } return Util.toFloat(def, 0.0); },
  limit:            function(value, min, max)   { return Math.max(min, Math.min(value, max));                     },
  randomInt:        function(min, max)          { return Math.round(Util.interpolate(min, max, Math.random()));   },
  randomChoice:     function(options)           { return options[Util.randomInt(0, options.length-1)];            },
  percentRemaining: function(n, total)          { return (n%total)/total;                                         },
  accelerate:       function(v, accel, dt)      { return v + (accel * dt);                                        },
  interpolate:      function(a,b,percent)       { return a + (b-a)*percent                                        },
  easeIn:           function(a,b,percent)       { return a + (b-a)*Math.pow(percent,2);                           },
  easeOut:          function(a,b,percent)       { return a + (b-a)*(1-Math.pow(1-percent,2));                     },
  easeInOut:        function(a,b,percent)       { return a + (b-a)*((-Math.cos(percent*Math.PI)/2) + 0.5);        },
  exponentialFog:   function(distance, density) { return 1 / (Math.pow(Math.E, (distance * distance * density))); },

  increase:  function(start, increment, max) { // with looping
    var result = start + increment;
    while (result >= max)
      result -= max;
    while (result < 0)
      result += max;
    return result;
  },

  project: function(p, cameraX, cameraY, cameraZ, cameraDepth, width, height, roadWidth) {
    p.camera.x     = (p.world.x || 0) - cameraX;
    p.camera.y     = (p.world.y || 0) - cameraY;
    p.camera.z     = (p.world.z || 0) - cameraZ;
    p.screen.scale = cameraDepth/p.camera.z;
    p.screen.x     = Math.round((width/2)  + (p.screen.scale * p.camera.x  * width/2));
    p.screen.y     = Math.round((height/2) - (p.screen.scale * p.camera.y  * height/2));
    p.screen.w     = Math.round(             (p.screen.scale * roadWidth   * width/2));
  },

  overlap: function(x1, w1, x2, w2, percent) {
    var half = (percent || 1)/2;
    var min1 = x1 - (w1*half);
    var max1 = x1 + (w1*half);
    var min2 = x2 - (w2*half);
    var max2 = x2 + (w2*half);
    return ! ((max1 < min2) || (min1 > max2));
  }

}

//=========================================================================
// POLYFILL for requestAnimationFrame
//=========================================================================

if (!window.requestAnimationFrame) { // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
  window.requestAnimationFrame = window.webkitRequestAnimationFrame || 
                                 window.mozRequestAnimationFrame    || 
                                 window.oRequestAnimationFrame      || 
                                 window.msRequestAnimationFrame     || 
                                 function(callback, element) {
                                   window.setTimeout(callback, 1000 / 60);
                                 }
}

//=========================================================================
// GAME LOOP helpers
//=========================================================================

var Game = {  // a modified version of the game loop from my previous boulderdash game - see http://codeincomplete.com/posts/2011/10/25/javascript_boulderdash/#gameloop

  run: function(options) {

    Game.loadImages(options.images, function(images) {

      options.ready(images); // tell caller to initialize itself because images are loaded and we're ready to rumble

      Game.setKeyListener(options.keys);

      var canvas = options.canvas,    // canvas render target is provided by caller
          update = options.update,    // method to update game logic is provided by caller
          render = options.render,    // method to render the game is provided by caller
          step   = options.step,      // fixed frame step (1/fps) is specified by caller
          stats  = options.stats,     // stats instance is provided by caller
          now    = null,
          last   = Util.timestamp(),
          dt     = 0,
          gdt    = 0;

      function frame() {
        now = Util.timestamp();
        dt  = Math.min(1, (now - last) / 1000); // using requestAnimationFrame have to be able to handle large deltas caused when it 'hibernates' in a background or non-visible tab
        gdt = gdt + dt;
        while (gdt > step) {
          gdt = gdt - step;
          update(step);
        }
	
        render();
        if(stats) stats.update();
        last = now;
        requestAnimationFrame(frame, canvas);
      }
      frame(); // lets get this party started
     // Game.playMusic();
    });
  },

  //---------------------------------------------------------------------------

  loadImages: function(names, callback) { // load multiple images and callback when ALL images have loaded
    var result = [];
    var count  = names.length;

    var onload = function() {
      if (--count == 0)
        callback(result);
    };

    for(var n = 0 ; n < names.length ; n++) {
      var name = names[n];
      result[n] = document.createElement('img');
      Dom.on(result[n], 'load', onload);
      result[n].src = "images/" + name + ".png";
	  
    }
  },

  //---------------------------------------------------------------------------

  setKeyListener: function(keys) {
    var onkey = function(keyCode, mode) {
      var n, k;
      for(n = 0 ; n < keys.length ; n++) {
        k = keys[n];
        k.mode = k.mode || 'up';
        if ((k.key == keyCode) || (k.keys && (k.keys.indexOf(keyCode) >= 0))) {
          if (k.mode == mode) {
            k.action.call();
          }
        }
      }
    };
    Dom.on(document, 'keydown', function(ev) { onkey(ev.keyCode, 'down'); } );
    Dom.on(document, 'keyup',   function(ev) { onkey(ev.keyCode, 'up');   } );
  },

  //---------------------------------------------------------------------------

  stats: function(parentId, id) { // construct mr.doobs FPS counter - along with friendly good/bad/ok message box

    var result = new Stats();
    result.domElement.id = id || 'stats';
    Dom.get(parentId).appendChild(result.domElement);

    var msg = document.createElement('div');
    msg.style.cssText = "border: 2px solid gray; padding: 5px; margin-top: 5px; text-align: left; font-size: 1.15em; text-align: right;";
    msg.innerHTML = "Your canvas performance is ";
    Dom.get(parentId).appendChild(msg);

    var value = document.createElement('span');
    value.innerHTML = "...";
    msg.appendChild(value);

    setInterval(function() {
      var fps   = result.current();
      var ok    = (fps > 50) ? 'good'  : (fps < 30) ? 'bad' : 'ok';
      var color = (fps > 50) ? 'green' : (fps < 30) ? 'red' : 'gray';
      value.innerHTML       = ok;
      value.style.color     = color;
      msg.style.borderColor = color;
    }, 5000);
    return result;
  },

  //---------------------------------------------------------------------------

  playMusic: function() {
    var music = Dom.get('music');
    music.loop = true;
    music.volume = 0.05; // shhhh! annoying music!
    music.muted = (Dom.storage.muted === "true");
    music.play();
    Dom.toggleClassName('mute', 'on', music.muted);
    Dom.on('mute', 'click', function() {
      Dom.storage.muted = music.muted = !music.muted;
      Dom.toggleClassName('mute', 'on', music.muted);
    });
  },
  
  changeStep: function(newStep){
	  step = newStep;
	  
  }

}

//=========================================================================
// canvas rendering helpers
//=========================================================================

var Render = {

  polygon: function(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {

    ctx.fillStyle = color;
    ctx.beginPath();
    

      
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
	
	
    ctx.closePath();
	
    ctx.fill();
	
	
  },

  //---------------------------------------------------------------------------

  segment: function(ctx, width, lanes, x1, y1, w1, x2, y2, w2, fog, color,noRumble) {

    var r1 = Render.rumbleWidth(w1, lanes),
        r2 = Render.rumbleWidth(w2, lanes),
        l1 = Render.laneMarkerWidth(w1, lanes),
        l2 = Render.laneMarkerWidth(w2, lanes),
        lanew1, lanew2, lanex1, lanex2, lane;
    
    ctx.fillStyle = color.grass;
    ctx.fillRect(0, y2, width, y1 - y2);
    
	if(!noRumble)
	{
    Render.polygon(ctx, x1-w1-r1, y1, x1-w1, y1, x2-w2, y2, x2-w2-r2, y2, color.rumble);
    Render.polygon(ctx, x1+w1+r1, y1, x1+w1, y1, x2+w2, y2, x2+w2+r2, y2, color.rumble);
	}
    Render.polygon(ctx, x1-w1,    y1, x1+w1, y1, x2+w2, y2, x2-w2,    y2, color.road);
    
    if (color.lane) {
      lanew1 = w1*2/lanes;
      lanew2 = w2*2/lanes;
      lanex1 = x1 - w1 + lanew1;
      lanex2 = x2 - w2 + lanew2;
      for(lane = 1 ; lane < lanes ; lanex1 += lanew1, lanex2 += lanew2, lane++)
        Render.polygon(ctx, lanex1 - l1/2, y1, lanex1 + l1/2, y1, lanex2 + l2/2, y2, lanex2 - l2/2, y2, color.lane);
    }
    
    Render.fog(ctx, 0, y1, width, y2-y1, fog);
  },

  //---------------------------------------------------------------------------

  background: function(ctx, background, width, height, layer, rotation, offset) {

    rotation = rotation || 0;
    offset   = offset   || 0;

    var imageW = layer.w;
    var imageH = layer.h;

    var sourceX = layer.x + Math.floor(layer.w * rotation);
    var sourceY = layer.y;
    var sourceW = Math.min(imageW, layer.x+layer.w-sourceX);
    var sourceH = imageH;
    
    var destX = 0;
    var destY = offset+ 200 ;
    var destW = Math.floor(width * (sourceW/imageW));
    var destH = height/4;
	
	var xDiff = destX;

	//alert(ctx+" "+background.width);

	
	ctx.fillStyle = COLORS.FOG;
    ctx.fillRect(0,  destY -10, width, height);
  

   ctx.drawImage(background, sourceX, sourceY, sourceW, sourceH , destX, destY, destW, destH);
   if (sourceW < imageW)
   ctx.drawImage(background, layer.x, sourceY, imageW-sourceW, sourceH , destW-1, destY, width-destW, destH);
	  
	  
	  
	    //ctx.restore();
	  
	
	  
  },

  //---------------------------------------------------------------------------

  sprite: function(ctx, width, height, resolution, roadWidth, sprites, sprite, scale, destX, destY, offsetX, offsetY,
  clipY,special,hit) {

                    //  scale for projection AND relative to roadWidth (for tweakUI)
    var destW  = (sprite.w * scale * width/2) * (SPRITES.SCALE * roadWidth);
    var destH  = (sprite.h * scale * width/2) * (SPRITES.SCALE * roadWidth);
	
	if(special == "banner"){destW *=3; destH *=3;}

    destX = destX + (destW * (offsetX || 0));
    destY = destY + (destH * (offsetY || 0));
	
	if(special == "flagman")
	{
	flagtick > 60 ? flagtick = 0 : flagtick++;
	
	if(flagtick >= 20 && flagtick < 40) sprite = SPRITES.FLAGMAN3;
	else if(flagtick >= 10 &&  flagtick < 20) sprite = SPRITES.FLAGMAN2;
	else if(flagtick >= 40 &&  flagtick < 50) sprite = SPRITES.FLAGMAN2;
	
		
	}
	var team = special;
	
	if(hit >0)
	{
		
		sprite = SPRITES.SPIN_SEQUENCES[team.toUpperCase()][Math.floor(hit/4) % SPRITES.SPIN_SEQUENCES[team.toUpperCase()].length];
		
	}
	else if(hit < 0)
	{
		sprite = SPRITES.SPIN_SEQUENCES[team.toUpperCase()][4];
		
		if(hit <= -100)
		{
sprite = SPRITES.SPIN_SEQUENCES[team.toUpperCase()][(4+Math.ceil(Math.abs(hit +100)/3)) % SPRITES.SPIN_SEQUENCES[team.toUpperCase()].length];
			
		}
		
	}
	

    var clipH = clipY ? Math.max(0, destY+destH-clipY) : 0;
    if (clipH < destH)
      ctx.drawImage(sprites, sprite.x, sprite.y, sprite.w, sprite.h - (sprite.h*clipH/destH), destX, destY, destW, destH - clipH);
	  
     
  },

  //---------------------------------------------------------------------------

  player: function(ctx, width, height, resolution, roadWidth, sprites, speedPercent, scale, destX, destY, steer, updown, crashed,burnout) {
    
	//bring in the game over carousel
	
		if(gameOverTick > 150)
		{
			var j = Math.floor((gameOverTick - 151)/2);
			
			//var yPos = j >= 7 ? 40+j*2: 0;
			//j >= 18 ? yPos = 300: yPos = yPos;
			//if(j > GAMEOVER.ANIM.length -1) j = GAMEOVER.ANIM.length -1;
			
	//Render.sprite(ctx, width, height, resolution, roadWidth, gameover, GAMEOVER.ANIM[j], scale/2, destX, destY , -0.5, -1);
	
	if(crashed >0)
	{
	Render.sprite(ctx, width, height, resolution, roadWidth, sprites, SPRITES.CRASH[4], scale, destX*1.4, destY +tireY  , -0.5, -1);
	Render.sprite(ctx, width, height, resolution, roadWidth, sprites, SPRITES.CRASHED_RIGHT, scale, destX, destY + 0, -0.5, -1);
	}
	else if(crashed < 0)
	{
	Render.sprite(ctx, width, height, resolution, roadWidth, sprites, SPRITES.CRASH[4], scale, destX*0.6, destY +tireY  , -0.5, -1);
	Render.sprite(ctx, width, height, resolution, roadWidth, sprites, SPRITES.CRASHED_LEFT, scale, destX, destY + 0, -0.5, -1);	
		
	}
	
	//fade to black
	
	//if(gameOverTick > 300)
	//{
		//ctx.fillStyle = 'rgba(0,0,0,'+((gameOverTick-300)/50)+')';
//ctx.fillRect(0,0,width,height);
		
	//}
	
	gameOverTick++;
	
	return;
		}
		
		
		
	//crashed on right side of road

    if(crashed >0)
	{
		if(crashtick++ % 4 ==0 || crashtick % 3 == 0)
		{
		ctx.fillStyle = "#555555";
        ctx.fillRect(0, 0, width, height);
		}
		
		Render.sprite(ctx, width, height, resolution, roadWidth, sprites, SPRITES.CRASHED_RIGHT, scale, destX, destY + 0, -0.5, -1);
		
		
		for (var i = 0; i < SPRITES.CRASH.length; i++)
		{
			
				if (crashtick >= SPRITES.CRASH.length * 2)
				{ 
				crashtick=1;
				
			
				
				}
			if(crashtick -1 <= i * 2) 
			{
				
				var crSprite =  SPRITES.CRASH[i];
				
				crashforce += crashgravity;
				tireY -= crashforce;
				gameOverTick++;
			
				
				if(tireY>50)
				{
					tireY = 50;
					crashforce *= -2/3;
				}
				
                
				
				Render.sprite(ctx, width, height, resolution, roadWidth, sprites, crSprite, scale, destX*1.4, destY +tireY  , -0.5, -1);
				break;
			}
			
		}
		
		return;
		
	}
	//crash on left side
	else  if(crashed <0)
	{
		
		if(crashtick++ % 3 == 0 || crashtick % 4 ==0 )
		{
			
		ctx.fillStyle = "#555555";
		
        ctx.fillRect(0, 0, width, height);
		}
		
		for (var i = 0; i < SPRITES.CRASH.length; i++)
		{
			
				if (crashtick >= SPRITES.CRASH.length * 2)
				{ 
				crashtick=1;
				
				
				}
			if(crashtick -1 <= i * 2) 
			{
				
				var crSprite =  SPRITES.CRASH[i];
				
				
				crashforce += crashgravity;
				tireY -= crashforce;
				gameOverTick++;
			
				
				if(tireY>50)
				{
					tireY = 50;
					crashforce *= -2/3;
				}
				

				
				Render.sprite(ctx, width, height, resolution, roadWidth, sprites, crSprite, scale, destX*0.6, destY + tireY, -0.5, -1);
				break;
			
			
		}
		
		
		}
		
		Render.sprite(ctx, width, height, resolution, roadWidth, sprites, SPRITES.CRASHED_LEFT, scale, destX, destY + 0, -0.5, -1);
		
		return;
		
	}
	
    var bounce = (1.5 * Math.random() * speedPercent * resolution) * Util.randomChoice([-1,1]);
	
    var sprite = SPRITES.PLAYER_STRAIGHT;
	var driver = SPRITES.STEERING_CENTER;
	
	
	var wheel = null;
	
	var roundedPercent = null;
	
	speedPercent < 0.15 ? roundedPercent = 0.15 : roundedPercent = speedPercent;
	
	if(wheelFrame <= 9) wheelFrame += roundedPercent;
	else wheelFrame = 1;
	
	
	
	
	
	 
	 
	
	 if(steer > 0 ) steering++ ;
	 if(steer < 0) steering--;
	 
	  if (steer == 0 && steering > 0)  steering--;
	 else if (steer == 0 && steering < 0) steering++;
	 
	 
	
	 
	 
     
	
	
	
	if(steering < -15) steering = -15;
	if(steering > 15) steering = 15;
	
	speedPercent == 0? tick = 1 : tick = Math.round(wheelFrame);
	
	
	if(steering == 0) 
	{
	bounce = 0;
	
	if      (tick == 1 || tick == 4 || tick == 7 )  wheel = SPRITES.WHEEL1;
	else if (tick == 2 || tick == 5 || tick == 8 )  wheel = SPRITES.WHEEL2;
	else if (tick == 3 || tick == 6 || tick >= 9 )  wheel = SPRITES.WHEEL3;
	
	
			
	}
	else if (steering < 0 && steering > -5) { wheel = SPRITES.WHEEL_CENTER_LEFT1; driver =  SPRITES.STEERING_CENTER_LEFT1; }
	else if (steering <= -5 && steering > -10) { wheel = SPRITES.WHEEL_CENTER_LEFT3; driver =  SPRITES.STEERING_CENTER_LEFT2; }
	else if (steering <= -10 && steering > -15){ wheel = SPRITES.WHEEL_CENTER_LEFT2; driver =  SPRITES.STEERING_CENTER_LEFT3; }
	else if (steering > 0 && steering < 5) {wheel = SPRITES.WHEEL_CENTER_RIGHT1; driver =  SPRITES.STEERING_CENTER_RIGHT1; }
	else if (steering >= 5 && steering < 10) {wheel = SPRITES.WHEEL_CENTER_RIGHT3; driver =  SPRITES.STEERING_CENTER_RIGHT2; }
	else if (steering >= 10 && steering < 15) {wheel = SPRITES.WHEEL_CENTER_RIGHT2; driver =  SPRITES.STEERING_CENTER_RIGHT3; }
	else if (steering >= 15 || steering <= -15)
	{
		
		if (steering < 0) driver =  SPRITES.STEERING_LEFT;
		else if (steering > 0) driver = SPRITES.STEERING_RIGHT;
		
	if (steer < 0)
	{
	if      (tick == 1 || tick == 4 || tick == 7 )  wheel = SPRITES.WHEEL_LEFT1 ;
	else if (tick == 2 || tick == 5 || tick == 8 )   wheel = SPRITES.WHEEL_LEFT2 ;
	else if (tick == 3 || tick == 6 || tick >= 9 )  wheel = SPRITES.WHEEL_LEFT3 ;
	}
	else if (steer > 0)
	{
	if (tick == 1 || tick == 4 || tick == 7 ) wheel = SPRITES.WHEEL_RIGHT1;
	else if (tick == 2 || tick == 5 || tick == 8 )  wheel = SPRITES.WHEEL_RIGHT2;
	else if (tick == 3 || tick == 6 || tick >= 9 ) wheel = SPRITES.WHEEL_RIGHT3;
	}
	}
	
	if(burnout)
	{
		var water;
		
	if (tick <= 2) water = SPRITES.WATER1;
	else if(tick <= 4) water = SPRITES.WATER2;
	else if(tick <=7)water = SPRITES.WATER3;
	else if(tick >7)water = SPRITES.WATER4;	
	
	Render.sprite(ctx, width, height, resolution, roadWidth, sprites, water, scale, destX-5, destY + 10, -0.5, -1);
	}

	
	Render.sprite(ctx, width, height, resolution, roadWidth, sprites, wheel, scale, destX, destY + 0, -0.5, -1);
    Render.sprite(ctx, width, height, resolution, roadWidth, sprites, sprite, scale, destX, destY +0, -0.5, -1);
	Render.sprite(ctx, width, height, resolution, roadWidth, sprites, driver, scale, destX, destY + bounce, -0.5, -1);
  },

  //---------------------------------------------------------------------------

  fog: function(ctx, x, y, width, height, fog) {
    if (fog < 1) {
      ctx.globalAlpha = (1-fog)
      ctx.fillStyle = COLORS.FOG;
      ctx.fillRect(x, y, width, height);
      ctx.globalAlpha = 1;
    }
  },
  
  lights: function(ctx, sprites, sprite, spriteY)   
  {
	  
	  
	  
	 var destW  = (sprite.w  * width) * (SPRITES.SCALE )/2;
     var destH  = (sprite.h  * width) * (SPRITES.SCALE )/2;
	   

	
	
	 
	 
	  ctx.drawImage(sprites, sprite.x, sprite.y, sprite.w, sprite.h , 0,spriteY, destW,destH);
	  
  },
  
  position: function(ctx, sprites, spriteX,spriteY,pos)  
  {
	  
	 var sprite = POSITION["P"+pos];
	  
	 var destW  = (sprite.w  * width) * (SPRITES.SCALE ) *0.5;
     var destH  = (sprite.h  * width) * (SPRITES.SCALE )  *0.5;
	   

	
	
	 
	 
	  ctx.drawImage(sprites, sprite.x, sprite.y, sprite.w, sprite.h ,spriteX,spriteY, destW,destH);
  },
  
  over: function(ctx, sprites,sprite, spriteX,spriteY)  
  {
	  
	
	  
	 var destW  = (sprite.w  * width) * (SPRITES.SCALE ) *0.5;
     var destH  = (sprite.h  * width) * (SPRITES.SCALE )  *0.5;
	   

	
	
	 
	 
	  ctx.drawImage(sprites, sprite.x, sprite.y, sprite.w, sprite.h ,spriteX,spriteY, destW,destH);
  },

  tachometer: function(ctx, sprites, sprite, spriteY,rotation,transmission,gear) 
  //Render.tachometer(ctx,tachometer,TACHOMETER.BACKGROUND,300,rpm,transmission,currentGear-1);
  
  {
	  
	  
	  
	 var destW  = (sprite.w  * width) * (SPRITES.SCALE ) *1;
     var destH  = (sprite.h  * width) * (SPRITES.SCALE ) * 1;
	   

	
	
	 
	 
	  ctx.drawImage(sprites, sprite.x, sprite.y, sprite.w, sprite.h , 0,spriteY, destW,destH);
	  
	  if(transmission != "manual"){ ctx.drawImage(sprites, TACHOMETER.AUTO.x, TACHOMETER.AUTO.y, TACHOMETER.AUTO.w, TACHOMETER.AUTO.h , 0,spriteY +100, TACHOMETER.AUTO.w *  width * (SPRITES.SCALE ) , TACHOMETER.AUTO.h * width * (SPRITES.SCALE )  );}
	  else { 
	 var GEAR = TACHOMETER.GEARS[gear];
	 
	  ctx.drawImage(sprites, GEAR.x, GEAR.y, GEAR.w, GEAR.h , 0,spriteY+100 , GEAR.w *  width * (SPRITES.SCALE ) , 
	  GEAR.h * width * (SPRITES.SCALE )  );
	  
	  }
	  
	  
ctx.save();
ctx.translate( 0, spriteY );
ctx.rotate( (Math.PI/2.5)*rotation );
ctx.translate( -0, -spriteY );
ctx.drawImage( sprites, TACHOMETER.NEEDLE.x, TACHOMETER.NEEDLE.y,TACHOMETER.NEEDLE.w,TACHOMETER.NEEDLE.h,10,spriteY,TACHOMETER.NEEDLE.w* width * (SPRITES.SCALE ),TACHOMETER.NEEDLE.h * width * (SPRITES.SCALE ) );
ctx.restore();
	  

	
	  
	  
  },

  

  pit: function(ctx, sprites, sprite,spriteX, spriteY,action) 
  
  {
	  
	  
	  
	 var destW  = (sprite.w  * width) * (SPRITES.SCALE ) * 1/2;
     var destH  = (sprite.h  * width) * (SPRITES.SCALE ) * 1/2;
	   

	if(action == "pitstop")
	{
		
		 ctx.drawImage(sprites, sprite.x, sprite.y, sprite.w, sprite.h ,spriteX,spriteY, destW,destH);
	}
	else if(action == "car")
	{
		
		 destW  = (sprite.w  * width) * (SPRITES.SCALE ) * 0.35;
         destH  = (sprite.h  * width) * (SPRITES.SCALE ) * 0.35;
		
		 ctx.drawImage(sprites, sprite.x, sprite.y, sprite.w, sprite.h ,spriteX,spriteY, destW,destH);
	}
	else
	{
	
	 
	 
	 if(wheelFrame  < 5 ) ctx.drawImage(sprites, sprite.x, sprite.y, sprite.w, sprite.h , width/2-destW/2,spriteY, destW,destH);
	}
	
  },
  
  map: function(ctx, sprites, sprite, spriteX,spriteY,clipY) {
	  
	  
	  
	 var destW  = (sprite.w  * width) * (SPRITES.SCALE ) *1/2;
     var destH  = (sprite.h  * width) * (SPRITES.SCALE ) * 1/2;
	   

	
	
	 
	 
	  ctx.drawImage(sprites, sprite.x, sprite.y, sprite.w, sprite.h ,spriteX* width * (SPRITES.SCALE ) *1/2,spriteY* width * (SPRITES.SCALE ) *1/2, destW,destH);
	 
  },
   rain: function(ctx,sprites,spriteX,spriteY,scale,n) {
	  
	  
	  
	  
	  
	 
	 
	  
	 var destW  = (RAIN.FRAME1.w  * scale * width/2) * (SPRITES.SCALE * roadWidth);
     var destH  = (RAIN.FRAME1.h * scale * width/2) * (SPRITES.SCALE * roadWidth);
	  
	  destW *= 0.1;
	  destH *= 0.2;
	  spriteY *= 0.3;
	  spriteX *= 0.1;
	  spriteY -= 100;
	  spriteX -= 200;
      n*=3;

	if(rainTick < 15+n)
	{
	 
	 
	  ctx.drawImage(sprites, RAIN.FRAME1.x, RAIN.FRAME1.y, RAIN.FRAME1.w, RAIN.FRAME1.h,spriteX,spriteY,destW,destH );
    }

		else if(rainTick < 30+n)
	{
	 
	 
	  ctx.drawImage(sprites, RAIN.FRAME2.x, RAIN.FRAME2.y, RAIN.FRAME2.w, RAIN.FRAME2.h,spriteX-rainTick,spriteY,destW,destH);
    }
	
	rainTick++;
	if(rainTick >= 50) rainTick = 0;
	  
   },
   
  rumbleWidth:     function(projectedRoadWidth, lanes) { return projectedRoadWidth/Math.max(3,  1.5*lanes); },
  laneMarkerWidth: function(projectedRoadWidth, lanes) { return projectedRoadWidth/Math.max(32, 8*lanes); }

}

//=============================================================================
// RACING GAME CONSTANTS
//=============================================================================

var KEY = {
  LEFT:  37,
  UP:    38,
  RIGHT: 39,
  DOWN:  40,
  A:     65,
  D:     68,
  S:     83,
  W:     87,
  ENTER:     13
};

var COLORS = {
  SKY:  '#72D7EE',
  TREE: '#005108',
  FOG:  '#aacccc',
  LIGHT:  { road: '#6B6B6B', grass: '#7db159', rumble: '#ffffff', lane: '#CCCCCC'  },
  DARK:   { road: '#696969', grass: '#79a75a', rumble: '#EC2D01'                   },
  START:  { road: 'white',   grass: 'white',   rumble: 'white'                     },
  FINISH: { road: 'black',   grass: 'black',   rumble: 'black'                     }
};

var BACKGROUND = {
  HILLS: { x:    8, y:    168, w: 1023, h:  72 },
  CLOUDS:   { x:    5, y:  1295, w: 1023, h:  90 },
  TREES: { x:    5, y:  985, w: 1280, h:  480 }
};

var TACHOMETER = {
  BACKGROUND:  { x:    0, y:  0, w: 95, h:  85 },
  AUTO:  { x:    0, y:  336, w: 65, h:  16 },
  GEAR1: { x:    0, y:  125, w: 65, h:  24 },
  GEAR2: { x:    0, y:  154, w: 65, h:  24 },
  GEAR3: { x:    0, y:  184, w: 65, h:  24 },
  GEAR4: { x:    0, y:  214, w: 65, h:  24 },
  GEAR5: { x:    0, y:  245, w: 65, h:  24 },
  GEAR6: { x:    0, y:  278, w: 65, h:  24 },
  GEAR7: { x:    0, y:  308, w: 65, h:  24 },
  NEEDLE: { x:   21, y:  106, w: 76, h:  6 }
};

TACHOMETER.GEARS = [TACHOMETER.GEAR1,TACHOMETER.GEAR2,TACHOMETER.GEAR3,TACHOMETER.GEAR4,TACHOMETER.GEAR5,TACHOMETER.GEAR6,TACHOMETER.GEAR7];

var MAPS = {
	SAN_MARINO: {x:0,y:0,w:100,h:189},
	DOT: {x:184,y:0,w:16,h:16}
};

var LIGHTS = {
	NONE: {x:0,y:0,w:192,h:80},
	RED: {x:0,y:80,w:192,h:80},
	GREEN: {x:0,y:160,w:192,h:80}
};

var RAIN = {
  FRAME1:  { x:    0, y:  0, w: 2077, h: 447 },
  FRAME2: { x:    0, y:  447,w: 2077, h:  447 }
};

var PODIUM = {
  FRAME1:  { x:    0, y:  0, w: 223, h: 316 },
  FRAME2: { x:    0, y:  316,w: 223, h:  316 },
  FRAME3: { x:    0, y:  632,w: 223, h:  316 },
  TROPHY: { x:    0, y:  950,w: 223, h:  100 }
};

var PITWORK = {
  FRAME1:  { x:    0, y:  0, w: 513, h: 450 },
  FRAME2: { x:    0, y:  450,w: 513, h: 450 },
  FRAME3: { x:    0, y:  900,w: 513, h: 450 },
  FRAME4: { x:    0, y:  1350,w: 513, h: 450 },
  FRAME5: { x:    0, y:  1800,w: 513, h: 450 },
  FRAME6: { x:    0, y:  2250,w: 513, h: 450 },
  FRAME7: { x:    0, y:  2700,w: 513, h: 450 },
  FRAME8: { x:    0, y:  3150,w: 513, h: 450 },
  FRAME9: { x:    0, y:  3600,w: 513, h: 450 },
  FRAME10: { x:    0, y: 4050,w: 513, h: 450 },
  FRAME11: { x:    0, y: 4500,w: 513, h: 450 },
  FRAME12: { x:    0, y: 4950,w: 513, h: 450 },
  FRAME13: { x:    0, y: 5400,w: 513, h: 450 }
};

var TEAMS   = {
	MADONNA :{name:"Madonna",driver:"A Asselin"},
	MILLIONS :{name:"Millions",driver:"R Cotman"},
	LOSEL :{name:"Losel",driver:"G Ceara"},
	BESTOWAL :{name:"Bestowal",driver:"A Picos"},
	FIRENZE :{name:"Firenze",driver:"F Essler"},
	BLANCHE :{name:"Blanche",driver:"G Alberti"},
	TYRANT :{name:"Tyrant",driver:"M Hamano"},
	MAY :{name:"May",driver:"G Turner"},
	BULLETS :{name:"Bullets",driver:"J Herbin"},
	DARDAN :{name:"Dardan",driver:"You"},
	LINDEN :{name:"Linden",driver:"M Moureau"},
	MINARAE :{name:"Minarae",driver:"E Bellini"},
	RIGEL :{name:"Rigel",driver:"E Pacheco"},
	COMET :{name:"Comet",driver:"E Tornio"},
	ORCHIS :{name:"Orchis",driver:"C Tegner"},
	ZEROFORCE :{name:"Zeroforce",driver:"P Klingman"}
}

var WELCOME = {
	
	 DARDAN: { x:    0, y:  0, w: 651, h: 450 }
	
}

var DRIVERS = {
	G_CEARA:       { x:    0, y:  0, w: 167, h: 168, country:"Brazil" },
	G_CEARA_HEAD:  { x:    167, y:  0, w: 167, h: 168 },
	R_COTMAN:       { x:    0, y:  167, w: 167, h: 168,country:"Great Britain" },
	R_COTMAN_HEAD:  { x:    167, y: 167, w: 167, h: 168 },
	G_TURNER:       { x:    0, y: 334, w: 167, h: 168,country:"Great Britain" },
	G_TURNER_HEAD:  { x:    167, y: 334, w: 167, h: 168 },
	A_PICOS:       { x:    0, y: 501, w: 167, h: 168, country:"Brazil" },
	A_PICOS_HEAD:  { x:    167, y: 501, w: 167, h: 168 },
	A_ASSELIN:       { x:    0, y: 668, w: 167, h: 168, country:"France" },
	A_ASSELIN_HEAD:  { x:    167, y: 668, w: 167, h: 168 },
	P_KLINGMAN:       { x:    0, y: 835, w: 167, h: 168,country:"Germany" },
	P_KLINGMAN_HEAD:  { x:    167, y: 835, w: 167, h: 168 },
	C_TEGNER:       { x:    0, y: 1002, w: 167, h: 168, country:"Sweden" },
	C_TEGNER_HEAD:  { x:    167, y: 1002, w: 167, h: 168 },
	E_TORNIO:       { x:    0, y: 1169, w: 167, h: 168,country:"Italy" },
	E_TORNIO_HEAD:  { x:    167, y: 1169, w: 167, h: 168 },
	M_MOUREAU:       { x:    0, y: 1336, w: 167, h: 168,country:"France" },
	M_MOUREAU_HEAD:  { x:    167, y: 1336, w: 167, h: 168 },
	E_BELLINI:       { x:    0, y: 1503, w: 167, h: 168,country:"Italy" },
	E_BELLINI_HEAD:  { x:    167, y: 1503, w: 167, h: 168 },
	E_PACHECO:       { x:    0, y: 1670, w: 167, h: 168,country:"Spain" },
	E_PACHECO_HEAD:  { x:    167, y: 1670, w: 167, h: 168 },
	M_HAMANO:       { x:    0, y: 1833, w: 167, h: 168,country:"Japan" },
	M_HAMANO_HEAD:  { x:    167, y: 1833, w: 167, h: 168 },
	F_ESSLER:       { x:    0, y: 2000, w: 167, h: 168,country:"Austria" },
	F_ESSLER_HEAD:  { x:    167, y: 2000, w: 167, h: 168 },
	G_ALBERTI:       { x:    0, y: 2167, w: 167, h: 168,country:"Italy" },
	G_ALBERTI_HEAD:  { x:    167, y: 2167, w: 167, h: 168 },
	J_HERBIN:       { x:    0, y: 2334, w: 167, h: 168,country:"France" },
	J_HERBIN_HEAD:  { x:    167, y: 2334, w: 167, h: 168 },
	YOU:            { x:    0, y: 0, w: 128, h: 128,country:"Your Country" },
	YOU_WINK:       { x:    128, y: 0, w: 128, h: 128 },
	YOU_HEAD:       { x:    128, y: 0, w: 128, h: 128 },
	YOU_HEAD_WINK:  { x:    128, y: 128, w: 128, h: 128 }
	
};

var POSITION = {
	P16:       { x:    0, y:  0, w: 151, h: 52 },
	P15:       { x:    0, y:  52, w: 151, h: 52 },
	P14:       { x:    0, y:  104, w: 151, h: 52 },
	P13:       { x:    0, y:  156, w: 151, h: 52 },
	P12:       { x:    0, y:  208, w: 151, h: 52 },
	P11:       { x:    0, y:  260, w: 151, h: 52 },
	P10:       { x:    0, y:  312, w: 151, h: 52 },
	P9:       { x:    0, y:  364, w: 151, h: 52 },
	P8:       { x:    0, y:  416, w: 151, h: 52 },
	P7:       { x:    0, y:  468, w: 151, h: 52 },
	P6:       { x:    0, y:  520, w: 151, h: 52 },
	P5:       { x:    0, y:  574, w: 151, h: 52 },
	P4:       { x:    0, y:  626, w: 151, h: 52 },
	P3:       { x:    0, y:  678, w: 151, h: 52 },
	P2:       { x:    0, y:  730, w: 151, h: 52 },
	P1:       { x:    0, y:  782, w: 151, h: 52 }
}

var LOGO = {
	FRAME1: { x:    0, y:  0, w: 320, h:  224 },
	FRAME2: { x:    0, y:  224, w: 320, h:  224 },
	FRAME3: { x:    0, y:  448, w: 320, h:  224 },
	FRAME4: { x:    0, y:  672, w: 320, h:  224 },
	FRAME5: { x:    0, y:  896, w: 320, h:  224 },
	FRAME6: { x:    0, y:  1120, w: 320, h:  224 },
	FRAME7: { x:    0, y:  1344, w: 320, h:  224 },
	FRAME8: { x:    0, y:  1568, w: 320, h:  224 },
	FRAME9: { x:    0, y:  1792, w: 320, h:  224 },
	FRAME10: { x:    0, y:  2016, w: 320, h:  224 },
	FRAME11: { x:    0, y:  2240, w: 320, h:  224 },
	FRAME12: { x:    0, y:  2464, w: 320, h:  224 },
	FRAME13: { x:    0, y:  2688, w: 320, h:  224 },
	FRAME14: { x:    0, y:  2912, w: 320, h:  224 },
	FRAME15: { x:    0, y:  3136, w: 320, h:  224 },
	FRAME16: { x:    0, y:  3360, w: 320, h:  224 },
	FRAME17: { x:    0, y:  3584, w: 320, h:  224 },
	
	
}

var TITLESCREEN = {
		LAYER1: { x:    0, y:  0, w: 640, h:  450 },
		LAYER2: { x:    0, y:  450, w: 640, h:  450 },
		LAYER3: { x:    0, y:  900, w: 640, h:  450 },
		LAYER4: { x:    0, y:  1350, w: 640, h:  450 },
		LAYER5: { x:    0, y:  1800, w: 640, h:  450 },
		SAN_MARINO: { x:    0, y:  2250, w: 640, h:  450 },
		LAYER6: { x:    0, y:  2700, w: 640, h:  450 },
		LAYER7: { x:    0, y:  3150, w: 640, h:  450 },
		PRESS_ENTER: { x:    0, y:  3600, w: 640, h:  450 },
		CONTROLS: { x:    0, y:  4050, w: 640, h:  450 }

}
var TRANSMISSION_SCREEN = {
		FRAME1: { x:    0, y:  0, w: 640, h:  450 },
		FRAME2: { x:    0, y:  450, w: 640, h:  450 },
		FRAME3: { x:    0, y:  900, w: 640, h:  450 },
		BACKGROUND: { x:    0, y:  1350, w: 640, h:  450 }
		
	
}

var GAMEOVER = {
	

  SPRITE53: { x:    0, y:  400 * 52, w: 504, h:  400 },
  SPRITE52: { x:    0, y:  400 * 51, w: 504, h:  400 },
   SPRITE51: { x:    0, y:  400 * 50, w: 504, h:  400 },
  SPRITE50: { x:    0, y:  400 * 49, w: 504, h:  400 },
  SPRITE49: { x:    0, y:  400 * 48, w: 504, h:  400 },
   SPRITE48: { x:    0, y:  400 * 47, w: 504, h:  400 },
   SPRITE47: { x:    0, y:  400 * 46, w: 504, h:  400 },
   SPRITE46: { x:    0, y:   400 * 45, w: 504, h:  400 },
   SPRITE45: { x:    0, y:  400 * 44, w: 504, h:  400 },
   
	SPRITE44: { x:    0, y:  400 * 43, w: 504, h:  400 },
  SPRITE43: { x:    0, y:  400 * 42, w: 504, h:  400 },
  SPRITE42: { x:    0, y:  400 * 41, w: 504, h:  400 },
   SPRITE41: { x:    0, y:  400 * 40, w: 504, h:  400 },
  SPRITE40: { x:    0, y:  400 * 39, w: 504, h:  400 },
  SPRITE39: { x:    0, y:  400 * 38, w: 504, h:  400 },
   SPRITE38: { x:    0, y:  400 * 37, w: 504, h:  400 },
   SPRITE37: { x:    0, y:  400 * 36, w: 504, h:  400 },
   SPRITE36: { x:    0, y:   400 * 35, w: 504, h:  400 },
   SPRITE35: { x:    0, y:  400 * 34, w: 504, h:  400 },
   SPRITE34: { x:    0, y:  400 * 33, w: 504, h:  400 },
   SPRITE33: { x:    0, y:  400 * 32, w: 504, h:  400 },
   SPRITE32: { x:    0, y:  400 * 31, w: 504, h:  400 },
    SPRITE31: { x:    0, y:  400 * 30, w: 504, h:  400 },
	 SPRITE30: { x:    0, y:  400 * 29, w: 504, h:  400 },
	  SPRITE29: { x:    0, y:  400 * 28, w: 504, h:  400 },
	   SPRITE28: { x:    0, y:  400 * 27, w: 504, h:  400 },
	    SPRITE27: { x:    0, y:  400 * 26, w: 504, h:  400 },
		SPRITE26: { x:    0, y:  400 * 25, w: 504, h:  400 },
		SPRITE25: { x:    0, y: 400 * 24, w: 504, h:  400 },
		SPRITE24: { x:    0, y: 400 * 23, w: 504, h:  400 },
		
  SPRITE23: { x:    0, y:  400 * 22, w: 504, h:  400 },
  SPRITE22: { x:    0, y:  400 * 21, w: 504, h:  400 },
  SPRITE21: { x:    0, y:  400 * 20, w: 504, h:  400 },
   SPRITE20: { x:    0, y:  400 * 19, w: 504, h:  400 },
  SPRITE19: { x:    0, y:  400 * 18, w: 504, h:  400 },
  SPRITE18: { x:    0, y:  400 * 17, w: 504, h:  400 },
   SPRITE17: { x:    0, y:  400 * 16, w: 504, h:  400 },
   SPRITE16: { x:    0, y:  400 * 15, w: 504, h:  400 },
   SPRITE15: { x:    0, y:   400 * 14, w: 504, h:  400 },
   SPRITE14: { x:    0, y:  400 * 13, w: 504, h:  400 },
   SPRITE13: { x:    0, y:  400 * 12, w: 504, h:  400 },
   SPRITE12: { x:    0, y:  400 * 11, w: 504, h:  400 },
   SPRITE11: { x:    0, y:  400 * 10, w: 504, h:  400 },
    SPRITE10: { x:    0, y:  400 * 9, w: 504, h:  400 },
	 SPRITE9: { x:    0, y:  400 * 8, w: 504, h:  400 },
	  SPRITE8: { x:    0, y:  400 * 7, w: 504, h:  400 },
	   SPRITE7: { x:    0, y:  400 * 6, w: 504, h:  400 },
	    SPRITE6: { x:    0, y:  400 * 5, w: 504, h:  400 },
		SPRITE5: { x:    0, y:  400 * 4, w: 504, h:  400 },
		SPRITE4: { x:    0, y: 400 * 3, w: 504, h:  400 },
		SPRITE3: { x:    0, y: 400 * 2, w: 504, h:  400 },
		SPRITE2: { x:    0, y: 400  , w: 504, h:  400 },
		SPRITE1: { x:    0, y: 0, w: 504, h:  400 }
};

var GRID = { x:    0, y:  8, w: 643, h:  447};

var WARNING ={
	
  TROUBLE:                { x:   0, y:  80, w:  238, h:   70 },
  RAIN:                   { x:   0, y:  140, w:  238, h:   70 },
  PIT_IN:                 { x:   0, y:  0, w:  238, h:  70 }
	
}

GAMEOVER.ANIM = [GAMEOVER.SPRITE1,GAMEOVER.SPRITE1,GAMEOVER.SPRITE1,GAMEOVER.SPRITE1,GAMEOVER.SPRITE1,GAMEOVER.SPRITE1,GAMEOVER.SPRITE1,GAMEOVER.SPRITE1,GAMEOVER.SPRITE2,GAMEOVER.SPRITE3,GAMEOVER.SPRITE4,GAMEOVER.SPRITE5,GAMEOVER.SPRITE6,GAMEOVER.SPRITE7,GAMEOVER.SPRITE8,GAMEOVER.SPRITE9,GAMEOVER.SPRITE10,GAMEOVER.SPRITE11,GAMEOVER.SPRITE12
,GAMEOVER.SPRITE13,GAMEOVER.SPRITE14,GAMEOVER.SPRITE15,GAMEOVER.SPRITE16,GAMEOVER.SPRITE17,GAMEOVER.SPRITE18
,GAMEOVER.SPRITE19,GAMEOVER.SPRITE20,GAMEOVER.SPRITE21,GAMEOVER.SPRITE22,GAMEOVER.SPRITE23,

GAMEOVER.SPRITE24,
GAMEOVER.SPRITE25,
GAMEOVER.SPRITE26,
GAMEOVER.SPRITE27,
GAMEOVER.SPRITE28,
GAMEOVER.SPRITE29,
GAMEOVER.SPRITE30,
GAMEOVER.SPRITE31,
GAMEOVER.SPRITE32,
GAMEOVER.SPRITE33,
GAMEOVER.SPRITE34,
GAMEOVER.SPRITE35,
GAMEOVER.SPRITE36,
GAMEOVER.SPRITE37,
GAMEOVER.SPRITE38,
GAMEOVER.SPRITE39,
GAMEOVER.SPRITE40,

GAMEOVER.SPRITE41,
GAMEOVER.SPRITE42,
GAMEOVER.SPRITE43,
GAMEOVER.SPRITE44,
GAMEOVER.SPRITE45,
GAMEOVER.SPRITE46,
GAMEOVER.SPRITE47,
GAMEOVER.SPRITE48,
GAMEOVER.SPRITE49,

GAMEOVER.SPRITE50,
GAMEOVER.SPRITE51,
GAMEOVER.SPRITE52,
GAMEOVER.SPRITE53,
GAMEOVER.SPRITE53];

GAMEOVER.ANIM.reverse();

var SPRITES = {
 
  PALM_TREE:              { x:    5, y:    5, w:  215, h:  540 },
  BANNER_HOSTERS:         { x:  40 , y:    845, w:  320, h:  65 },
  BILLBOARD08:            { x:  736, y:    872, w:  205, h:  132 },
  TREE1:                  { x:  625, y:    5, w:  360, h:  360 },
  DEAD_TREE1:             { x:    5, y:  555, w:  135, h:  332 },
  BILLBOARD09:            { x:  250, y: 1190, w:  200, h:  90 },
  TIRES:                  { x:  425, y:  870, w:  130, h:  65 },
//  BILLBOARD01:            { x:  625, y:  375, w:  300, h:  170 },
  BILLBOARD06:            { x:  598, y:  872, w:  114, h:  129 },
  BILLBOARD05:            { x:    5, y:  897, w:  298, h:  190 },
  BILLBOARD07:            { x:  313, y:  955, w:  298, h:  135 },
  BOULDER2:               { x:  621, y:  897, w:  298, h:  140 },

  BILLBOARD04:            { x: 776, y:  1352, w:  148, h:  135 },

  BUSH1:                  { x:    5, y: 1097, w:  240, h:  155 },
  BUSH2:                  { x:  255, y: 1097, w:  232, h:  152 },
  BILLBOARD03:            { x:    5, y: 1262, w:  230, h:  220 },
  BILLBOARD02:            { x:  245, y: 1262, w:  215, h:  220 },
  STUMP:                  { x:  995, y:  330, w:  195, h:  140 },
  
  
  PITSTOP:                { x:   0,  y:  0,    w:  2017,h:  448 },

  ARROW:                  { x:   801, y:  1004, w:  24,  h:   18 },
  
  WATER4:                  { x:  778, y: 803,  w:  207, h:  43 },
  WATER3:                  { x:  778, y: 847,  w:  207, h:  43 },
  WATER2:                  { x:  778, y: 897,  w:  207, h:  43 },
  WATER1:                  { x:  778, y: 942,  w:  207, h:  43 },
 
 
  
  LOSEL03:                  { x: 20, y:  5, w:  132, h:  58, livery:"Losel" },
  LOSEL02:                  { x: 20, y:  69, w:  132, h:   58,livery:"Losel" },
  LOSEL04:                  { x: 20, y:  72, w:  132, h:  58, livery:"Losel" },
  LOSEL01:                  { x: 20, y:  5, w:  121, h:  60, livery:"Losel" },
  LOSEL_CENTER_LEFT:        { x: 18, y: 277, w:   138, h:   60,livery:"Losel" },
  LOSEL_CENTER_RIGHT:      { x: 20, y: 213, w:   138, h:   60,livery:"Losel" },
  LOSEL_CENTER_RIGHT2:        { x: 20, y: 485, w:   138, h:   60,livery:"Losel" },
  LOSEL_CENTER_LEFT2:      { x: 18, y: 550, w:   138, h:   60,livery:"Losel" },
  LOSEL_FRONT_LEFT:        { x: 20,  y: 405, w:   150, h:   56, livery:"Losel" },
  LOSEL_FRONT:              { x: 20 ,y: 145, w:   145, h:   54,  livery:"Losel" },
  LOSEL_FRONT_RIGHT:       { x: 20, y: 346, w:   150, h:   55,livery:"Losel" },
  LOSEL_SPIN1:                { x: 1807, y:  926, w:  259, h:  65, livery:"Losel" },
  LOSEL_SPIN2:                 { x: 1807, y: 1003, w: 259, h:  65,livery:"Losel" },
  LOSEL_SPIN3:                 { x: 1807, y:  1086, w: 259, h:  65, livery:"Losel" },
  LOSEL_SPIN4:                  { x: 1807, y: 1174, w: 259, h:  65, livery:"Losel" },
  LOSEL_SPIN5:                 { x: 1807, y:  1261, w: 259, h:  65, livery:"Losel" },
  LOSEL_SPIN6:                  { x: 1807, y: 1352, w: 259, h:  65, livery:"Losel" },
  
  LINDEN03:                  { x: 1710, y:  5, w:  145, h:  58, livery:"Linden" },
  LINDEN02:                  { x: 1710, y:  69, w:  145, h:   58,livery:"Linden" },
  LINDEN04:                  { x: 1710, y:  72, w:  145, h:  58, livery:"Linden" },
  LINDEN01:                  { x: 1710, y:  5, w:  145, h:  60, livery:"Linden" },
  LINDEN_CENTER_LEFT:        { x: 1710, y: 277, w:   150, h:   60,livery:"Linden" },
  LINDEN_CENTER_RIGHT:      { x: 1710, y: 213, w:   150, h:   60,livery:"Linden" },
  LINDEN_CENTER_RIGHT2:        { x: 1710, y: 485, w:   150, h:   60,livery:"Linden" },
  LINDEN_CENTER_LEFT2:      { x: 1710, y: 550, w:   150, h:   60,livery:"Linden" },
  LINDEN_FRONT_LEFT:        { x: 1710,  y: 405, w:   150, h:   56, livery:"Linden" },
  LINDEN_FRONT:              { x: 1710 ,y: 145, w:   145, h:   54,  livery:"Linden" },
  LINDEN_FRONT_RIGHT:       { x: 1710, y: 346, w:   150, h:   55,livery:"Linden" },
  LINDEN_SPIN1:                { x: 2644, y:  926, w:  259, h:  65, livery:"Linden" },
  LINDEN_SPIN2:                 { x: 2644, y: 1003, w: 259, h:  65,livery:"Linden" },
  LINDEN_SPIN3:                 { x: 2644, y:  1086, w: 259, h:  65, livery:"Linden" },
  LINDEN_SPIN4:                  { x: 2644, y: 1174, w: 259, h:  65, livery:"Linden" },
  LINDEN_SPIN5:                 { x:2644, y:  1261, w: 259, h:  65, livery:"Linden" },
  LINDEN_SPIN6:                  { x: 2644, y: 1352, w: 259, h:  65, livery:"Linden" },
  
  DARDAN03:                  { x: 1887, y:  5, w:  145, h:  58, livery:"Dardan" },
  DARDAN02:                  { x: 1887, y:  69, w:  145, h:   58,livery:"Dardan" },
  DARDAN04:                  { x: 1887, y:  72, w:  145, h:  58, livery:"Dardan" },
  DARDAN01:                  { x: 1887, y:  5, w:  145, h:  60, livery:"Dardan" },
  DARDAN_CENTER_LEFT:        { x: 1887, y: 277, w:   150, h:   60,livery:"Dardan" },
  DARDAN_CENTER_RIGHT:      { x: 1887, y: 213, w:   150, h:   60,livery:"Dardan" },
  DARDAN_CENTER_RIGHT2:        { x: 1887, y: 485, w:   150, h:   60,livery:"Dardan" },
  DARDAN_CENTER_LEFT2:      { x: 1887, y: 550, w:   150, h:   60,livery:"Dardan" },
  DARDAN_FRONT_LEFT:        { x: 1887,  y: 405, w:   150, h:   56, livery:"Dardan" },
  DARDAN_FRONT:              { x: 1887, y: 145, w:   145, h:   54,  livery:"Dardan" },
  DARDAN_FRONT_RIGHT:       { x: 1887, y: 346, w:   150, h:   55,livery:"Dardan" },
  DARDAN_SPIN1:                { x: 2935, y:  926, w:  259, h:  65, livery:"Dardan" },
  DARDAN_SPIN2:                 { x: 2935, y: 1003, w: 259, h:  65,livery:"Dardan" },
  DARDAN_SPIN3:                 { x: 2935, y:  1086, w: 259, h:  65, livery:"Dardan" },
  DARDAN_SPIN4:                  { x: 2935, y: 1174, w: 259, h:  65, livery:"Dardan" },
  DARDAN_SPIN5:                 { x: 2935, y:  1261, w: 259, h:  65, livery:"Dardan" },
  DARDAN_SPIN6:                  { x: 2935, y: 1352, w: 259, h:  65, livery:"Dardan" },
  
  BESTOWAL03:                  { x: 2057, y:  5, w:  160, h:  62, livery:"Bestowal" },
  BESTOWAL02:                  { x: 2057, y:  69, w:  160, h:   62,livery:"Bestowal" },
  BESTOWAL04:                  { x: 2057, y:  72, w:  160, h:  62, livery:"Bestowal" },
  BESTOWAL01:                  { x: 2057, y:  5, w:  160, h:  62, livery:"Bestowal" },
  BESTOWAL_CENTER_LEFT:        { x:2057, y: 277, w:   155, h:   60,livery:"Bestowal" },
  BESTOWAL_CENTER_RIGHT:      { x: 2057, y: 213, w:   155, h:   60,livery:"Bestowal" },
  BESTOWAL_CENTER_RIGHT2:        { x: 2057, y: 485, w:   155, h:   60,livery:"Bestowal" },
  BESTOWAL_CENTER_LEFT2:      { x: 2057, y: 550, w:   155, h:   60,livery:"Bestowal" },
  BESTOWAL_FRONT_LEFT:        { x: 2057,  y: 405, w:   150, h:   56, livery:"Bestowal" },
  BESTOWAL_FRONT:              { x: 2057, y: 145, w:   145, h:   54,  livery:"Bestowal" },
  BESTOWAL_FRONT_RIGHT:       { x: 2057, y: 346, w:   150, h:   55,livery:"Bestowal" },
  BESTOWAL_SPIN1:                { x: 4073, y:  926, w:  259, h:  65, livery:"Bestowal" },
  BESTOWAL_SPIN2:                 { x: 4073, y: 1003, w: 259, h:  65,livery:"Bestowal" },
  BESTOWAL_SPIN3:                 { x: 4073, y:  1086, w: 259, h:  65, livery:"Bestowal" },
  BESTOWAL_SPIN4:                  { x: 4073, y: 1174, w: 259, h:  65, livery:"Bestowal" },
  BESTOWAL_SPIN5:                 { x: 4073, y:  1261, w: 259, h:  65, livery:"Bestowal" },
  BESTOWAL_SPIN6:                  { x: 4073, y: 1352, w: 259, h:  65, livery:"Bestowal" },
  
  TYRANT03:                  { x: 2231, y:  5, w:  160, h:  62, livery:"Tyrant" },
  TYRANT02:                  { x: 2231, y:  69, w:  160, h:   62,livery:"Tyrant" },
  TYRANT04:                  { x: 2231, y:  72, w:  160, h:  62, livery:"Tyrant" },
  TYRANT01:                  { x: 2231, y:  5, w:  160, h:  62, livery:"Tyrant" },
  TYRANT_CENTER_LEFT:        { x:2231, y: 277, w:   155, h:   60,livery:"Tyrant" },
  TYRANT_CENTER_RIGHT:      { x: 2231, y: 213, w:   155, h:   60,livery:"Tyrant" },
  TYRANT_CENTER_RIGHT2:        { x: 2231, y: 485, w:   155, h:   60,livery:"Tyrant" },
  TYRANT_CENTER_LEFT2:      { x: 2231, y: 550, w:   155, h:   60,livery:"Tyrant" },
  TYRANT_FRONT_LEFT:        { x: 2231,  y: 405, w:   150, h:   56, livery:"Tyrant" },
  TYRANT_FRONT:              { x: 2231, y: 145, w:   145, h:   54,  livery:"Tyrant" },
  TYRANT_FRONT_RIGHT:       { x: 2231, y: 346, w:   150, h:   55,livery:"Tyrant" },
  TYRANT_SPIN1:                { x: 3790, y:  926, w:  259, h:  65, livery:"Tyrant" },
  TYRANT_SPIN2:                 { x: 3790, y: 1003, w: 259, h:  65,livery:"Tyrant" },
  TYRANT_SPIN3:                 { x: 3790, y:  1086, w: 259, h:  65, livery:"Tyrant" },
  TYRANT_SPIN4:                  { x: 3790, y: 1174, w: 259, h:  65, livery:"Tyrant" },
  TYRANT_SPIN5:                 { x: 3790, y:  1261, w: 259, h:  65, livery:"Tyrant" },
  TYRANT_SPIN6:                  { x: 3790, y: 1352, w: 259, h:  65, livery:"Tyrant" },
  
  BULLETS03:                  { x: 2404, y:  5, w:  160, h:  62, livery:"Bullets" },
  BULLETS02:                  { x: 2404, y:  69, w:  160, h:   62,livery:"Bullets" },
  BULLETS04:                  { x: 2404, y:  72, w:  160, h:  62, livery:"Bullets" },
  BULLETS01:                  { x: 2404, y:  5, w:  160, h:  62, livery:"Bullets" },
  BULLETS_CENTER_LEFT:        { x:2404, y: 277, w:   155, h:   60,livery:"Bullets" },
  BULLETS_CENTER_RIGHT:      { x: 2404, y: 213, w:   155, h:   60,livery:"Bullets" },
  BULLETS_CENTER_RIGHT2:        { x: 2404, y: 485, w:   155, h:   60,livery:"Bullets" },
  BULLETS_CENTER_LEFT2:      { x: 2404, y: 550, w:   155, h:   60,livery:"Bullets" },
  BULLETS_FRONT_LEFT:        { x: 2404,  y: 405, w:   150, h:   56, livery:"Bullets" },
  BULLETS_FRONT:              { x: 2404, y: 145, w:   145, h:   54,  livery:"Bullets" },
  BULLETS_FRONT_RIGHT:       { x: 2404, y: 346, w:   150, h:   55,livery:"Bullets" },
  BULLETS_SPIN1:                { x: 3219, y:  926, w:  259, h:  65, livery:"Bullets" },
  BULLETS_SPIN2:                 { x: 3219, y: 1003, w: 259, h:  65,livery:"Bullets" },
  BULLETS_SPIN3:                 { x: 3219, y:  1086, w: 259, h:  65, livery:"Bullets" },
  BULLETS_SPIN4:                  { x: 3219, y: 1174, w: 259, h:  65, livery:"Bullets" },
  BULLETS_SPIN5:                 { x: 3219, y:  1261, w: 259, h:  65, livery:"Bullets" },
  BULLETS_SPIN6:                  { x: 3219, y: 1352, w: 259, h:  65, livery:"Bullets" },
  
  MAY03:                  { x: 1358, y:  5, w:  145, h:  58, livery:"May" },
  MAY02:                  { x: 1358, y:  69, w:  145, h:   58,livery:"May" },
  MAY04:                  { x: 1358, y:  72, w:  145, h:  58, livery:"May" },
  MAY01:                  { x: 1358, y:  5, w:  145, h:  60, livery:"May" },
  MAY_CENTER_LEFT:        { x: 1358, y: 277, w:   150, h:   60,livery:"May" },
  MAY_CENTER_RIGHT:      { x: 1358, y: 213, w:   150, h:   60,livery:"May" },
  MAY_CENTER_RIGHT2:        { x: 1358, y: 485, w:   150, h:   60,livery:"May" },
  MAY_CENTER_LEFT2:      { x: 1358, y: 550, w:   150, h:   60,livery:"May" },
  MAY_FRONT_LEFT:        { x: 1358,  y: 405, w:   150, h:   56, livery:"May" },
  MAY_FRONT:              { x: 1358 ,y: 145, w:   145, h:   54,  livery:"May" },
  MAY_FRONT_RIGHT:       { x: 1358, y: 346, w:   150, h:   55,livery:"May" },
  MAY_SPIN1:                { x: 3502, y:  926, w:  259, h:  65, livery:"May" },
  MAY_SPIN2:                 { x: 3502, y: 1003, w: 259, h:  65,livery:"May" },
  MAY_SPIN3:                 { x: 3502, y:  1086, w: 259, h:  65, livery:"May" },
  MAY_SPIN4:                  { x: 3502, y: 1174, w: 259, h:  65, livery:"May" },
  MAY_SPIN5:                 { x: 3502, y:  1261, w: 259, h:  65, livery:"May" },
  MAY_SPIN6:                  { x: 3502, y: 1352, w: 259, h:  65, livery:"May" },
  
  COMET03:                  { x: 1527, y:  5, w:  145, h:  58, livery:"Comet" },
  COMET02:                  { x: 1527, y:  69, w:  145, h:   58,livery:"Comet" },
  COMET04:                  { x: 1527, y:  72, w:  145, h:  58, livery:"Comet" },
  COMET01:                  { x: 1527, y:  5, w:  145, h:  60, livery:"Comet" },
  COMET_CENTER_LEFT:        { x: 1527, y: 277, w:   150, h:   60,livery:"Comet" },
  COMET_CENTER_RIGHT:      { x: 1527, y: 213, w:   150, h:   60,livery:"Comet" },
  COMET_CENTER_RIGHT2:        { x: 1527, y: 485, w:   150, h:   60,livery:"Comet" },
  COMET_CENTER_LEFT2:      { x: 1527, y: 550, w:   150, h:   60,livery:"Comet" },
  COMET_FRONT_LEFT:        { x: 1527,  y: 405, w:   150, h:   56, livery:"Comet" },
  COMET_FRONT:              { x: 1527 ,y: 145, w:   145, h:   54,  livery:"Comet" },
  COMET_FRONT_RIGHT:       { x: 1527, y: 346, w:   150, h:   55,livery:"Comet" },
  COMET_SPIN1:                { x: 5500, y:  926, w:  259, h:  65, livery:"Comet" },
  COMET_SPIN2:                 { x: 5500, y: 1003, w: 259, h:  65,livery:"Comet" },
  COMET_SPIN3:                 { x: 5500, y:  1086, w: 259, h:  65, livery:"Comet" },
  COMET_SPIN4:                  { x: 5500, y: 1174, w: 259, h:  65, livery:"Comet" },
  COMET_SPIN5:                 { x: 5500, y:  1261, w: 259, h:  65, livery:"Comet" },
  COMET_SPIN6:                  { x: 5500, y: 1352, w: 259, h:  65, livery:"Comet" },
  
  
  MILLIONS03:                  { x: 190, y:  5, w:  135, h:  58, livery:"Millions" },
  MILLIONS02:                  { x: 190, y:  69, w:  135, h:   58,livery:"Millions" },
  MILLIONS04:                  { x: 190, y:  72, w:  135, h:  58, livery:"Millions" },
  MILLIONS01:                  { x: 190, y:  5, w:  135, h:  58, livery:"Millions" },
  MILLIONS_CENTER_LEFT:        { x: 190, y: 279, w:   150, h:   56,livery:"Millions" },
  MILLIONS_CENTER_RIGHT:      { x:  190, y: 212, w:   150, h:   56,livery:"Millions" },
  MILLIONS_CENTER_LEFT2:        { x: 190, y: 552, w:   150, h:   56,livery:"Millions" },
  MILLIONS_CENTER_RIGHT2:      { x:  190, y: 485, w:   150, h:   56,livery:"Millions" },
  MILLIONS_FRONT_LEFT:        { x:  190,  y: 405, w:   150, h:   56, livery:"Millions" },
  MILLIONS_FRONT:              { x: 190 ,y: 145, w:   145, h:   54,  livery:"Millions" },
  MILLIONS_FRONT_RIGHT:       { x:  190, y: 346, w:   150, h:   55,livery:"Millions" },
  MILLIONS_SPIN1:                { x: 4364, y:  926, w:  259, h:  65, livery:"Millions" },
  MILLIONS_SPIN2:                 { x: 4364, y: 1003, w: 259, h:  65,livery:"Millions" },
  MILLIONS_SPIN3:                 { x: 4364, y:  1086, w: 259, h:  65, livery:"Millions" },
  MILLIONS_SPIN4:                  { x: 4364, y: 1174, w: 259, h:  65, livery:"Millions" },
  MILLIONS_SPIN5:                 { x: 4364, y:  1261, w: 259, h:  65, livery:"Millions" },
  MILLIONS_SPIN6:                  { x: 4364, y: 1352, w: 259, h:  65, livery:"Millions" },
  
  ZEROFORCE03:                  { x: 350, y:  5, w:  145, h:  54, livery:"Zeroforce" },
  ZEROFORCE02:                  { x: 350, y:  70, w:  145, h:   54,livery:"Zeroforce" },
  ZEROFORCE04:                  { x: 350, y:  72, w:  145, h:  54, livery:"Zeroforce" },
  ZEROFORCE01:                  { x: 350, y:  5, w:  145, h:  54, livery:"Zeroforce" },
  ZEROFORCE_CENTER_LEFT:        { x: 350, y: 279, w:   145, h:   56,livery:"Zeroforce" },
  ZEROFORCE_CENTER_RIGHT:      { x:  350, y: 212, w:   145, h:   56,livery:"Zeroforce" },
  ZEROFORCE_CENTER_LEFT2:        { x: 350, y: 552, w:   145, h:   56,livery:"Zeroforce" },
  ZEROFORCE_CENTER_RIGHT2:      { x:  350, y: 485, w:   145, h:   56,livery:"Zeroforce" },
  ZEROFORCE_FRONT_LEFT:        { x:  350,  y: 405, w:   150, h:   56, livery:"Zeroforce" },
  ZEROFORCE_FRONT:              { x: 350 ,y: 145, w:   145, h:   54,  livery:"Zeroforce" },
  ZEROFORCE_FRONT_RIGHT:       { x:  350, y: 346, w:   150, h:   55,livery:"Zeroforce" },
  
  ZEROFORCE_SPIN1:                { x: 2377, y:  926, w:  259, h:  65, livery:"Zeroforce" },
  ZEROFORCE_SPIN2:                 { x: 2377, y: 1003, w: 259, h:  65,livery:"Zeroforce" },
  ZEROFORCE_SPIN3:                 { x: 2377, y:  1086, w: 259, h:  65, livery:"Zeroforce" },
  ZEROFORCE_SPIN4:                  { x: 2377, y: 1174, w: 259, h:  65, livery:"Zeroforce" },
  ZEROFORCE_SPIN5:                 { x: 2377, y:  1261, w: 259, h:  65, livery:"Zeroforce" },
  ZEROFORCE_SPIN6:                  { x: 2377, y: 1352, w: 259, h:  65, livery:"Zeroforce" },
  
  
  
  
    
  
  RIGEL03:                  { x: 525, y:  5, w:  145, h:  54, livery:"Rigel" },
  RIGEL02:                  { x: 525, y:  70, w:  145, h:   54,livery:"Rigel" },
  RIGEL04:                  { x: 525, y:  69, w:  145, h:  54, livery:"Rigel" },
  RIGEL01:                  { x: 525, y:  5, w:  145, h:  54, livery:"Rigel" },
  RIGEL_CENTER_LEFT:        { x: 525, y: 279, w:   145, h:   56,livery:"Rigel" },
  RIGEL_CENTER_RIGHT:      { x:  525, y: 210, w:   145, h:   56,livery:"Rigel" },
  RIGEL_CENTER_LEFT2:        { x: 525, y: 551, w:   145, h:   56,livery:"Rigel" },
  RIGEL_CENTER_RIGHT2:      { x:  525, y: 485, w:   145, h:   56,livery:"Rigel" },
  RIGEL_FRONT_LEFT:        { x:  525,  y: 405, w:   150, h:   56, livery:"Rigel" },
  RIGEL_FRONT:              { x: 525 ,y: 145, w:   145, h:   54,  livery:"Rigel" },
  RIGEL_FRONT_RIGHT:       { x:  525, y: 346, w:   150, h:   55,livery:"Rigel" },
  RIGEL_SPIN1:                { x: 5775, y:  926, w:  259, h:  65, livery:"Rigel" },
  RIGEL_SPIN2:                 { x: 5775, y: 1003, w: 259, h:  65,livery:"Rigel" },
  RIGEL_SPIN3:                 { x: 5775, y:  1086, w: 259, h:  65, livery:"Rigel" },
  RIGEL_SPIN4:                  { x: 5775, y: 1174, w: 259, h:  65, livery:"Rigel" },
  RIGEL_SPIN5:                 { x: 5775, y:  1261, w: 259, h:  65, livery:"Rigel" },
  RIGEL_SPIN6:                  { x: 5775, y: 1352, w: 259, h:  65, livery:"Rigel" },
  
  
  MINARAE03:                { x: 700, y:  5, w:  145, h:  54, livery:"Minarae" },
  MINARAE02:                  { x: 700, y:  72, w:  145, h:   54,livery:"Minarae" },
  MINARAE04:                  { x: 700, y:  72, w:  145, h:  54, livery:"Minarae" },
  MINARAE01:                  { x: 700, y:  5, w:  145, h:  54, livery:"Minarae" },
  MINARAE_CENTER_LEFT:        { x: 700, y: 278, w:   145, h:   56,livery:"Minarae" },
  MINARAE_CENTER_RIGHT:      { x:  700, y: 212, w:   145, h:   56,livery:"Minarae" },
  MINARAE_CENTER_LEFT2:        { x: 700, y: 550, w:   145, h:   56,livery:"Minarae" },
  MINARAE_CENTER_RIGHT2:      { x:  700, y: 485, w:   145, h:   56,livery:"Minarae" },
  MINARAE_FRONT_LEFT:        { x:  700,  y: 405, w:   150, h:   56, livery:"Minarae" },
  MINARAE_FRONT:              { x: 700 ,y: 145, w:   145, h:   54,  livery:"Minarae" },
  MINARAE_FRONT_RIGHT:       { x:  700, y: 346, w:   150, h:   55,livery:"Minarae" },
  MINARAE_SPIN1:                { x: 1526, y:  926, w:  259, h:  65, livery:"Minarae" },
  MINARAE_SPIN2:                 { x: 1526, y: 1003, w: 259, h:  65,livery:"Minarae" },
  MINARAE_SPIN3:                 { x: 1526, y:  1086, w: 259, h:  65, livery:"Minarae" },
  MINARAE_SPIN4:                  { x: 1526, y: 1174, w: 259, h:  65, livery:"Minarae" },
  MINARAE_SPIN5:                 { x: 1526, y:  1261, w: 259, h:  65, livery:"Minarae" },
  MINARAE_SPIN6:                  { x: 1526, y: 1352, w: 259, h:  65, livery:"Minarae" },
  
  FIRENZE03:                { x: 879, y:  5, w:  145, h:  54, livery:"Firenze" },
  FIRENZE02:                  { x: 879, y:  70, w:  145, h:   54,livery:"Firenze" },
  FIRENZE04:                  { x: 879, y:  72, w:  145, h:  54, livery:"Firenze" },
  FIRENZE01:                  { x: 879, y:  5, w:  145, h:  54, livery:"Firenze" },
  FIRENZE_CENTER_LEFT:        { x: 879, y: 279, w:   145, h:   56,livery:"Firenze" },
  FIRENZE_CENTER_RIGHT:      { x:  879, y: 212, w:   145, h:   56,livery:"Firenze" },
  FIRENZE_CENTER_LEFT2:        { x: 879, y: 551, w:   145, h:   56,livery:"Firenze" },
  FIRENZE_CENTER_RIGHT2:      { x:  879, y: 486, w:   145, h:   56,livery:"Firenze" },
  FIRENZE_FRONT_LEFT:        { x:  879,  y: 414, w:   150, h:   56, livery:"Firenze" },
  FIRENZE_FRONT:              { x: 879 ,y: 145, w:   145, h:   54,  livery:"Firenze" },
  FIRENZE_FRONT_RIGHT:       { x:  879, y: 346, w:   150, h:   55,livery:"Firenze" },
  FIRENZE_SPIN1:                { x: 4653, y:  926, w:  259, h:  65, livery:"Firenze" },
  FIRENZE_SPIN2:                 { x: 4653, y: 1003, w: 259, h:  65,livery:"Firenze" },
  FIRENZE_SPIN3:                 { x: 4653, y:  1086, w: 259, h:  65, livery:"Firenze" },
  FIRENZE_SPIN4:                  { x: 4653, y: 1174, w: 259, h:  65, livery:"Firenze" },
  FIRENZE_SPIN5:                 { x: 4653, y:  1261, w: 259, h:  65, livery:"Firenze" },
  FIRENZE_SPIN6:                  { x: 4653, y: 1352, w: 259, h:  65, livery:"Firenze" },
  
  CAR03:                  { x: 1197, y:  5, w:   132, h: 56, livery:"Blanche" },
  CAR02:                  { x: 1197, y:  72, w:  132, h:   56,livery:"Blanche" },
  CAR04:                  { x: 1197, y:  72, w:   132, h:  56,livery:"Blanche" },
  CAR01:                  { x: 1197, y: 5, w:   132, h:   56,livery:"Blanche" },
  CAR_CENTER_LEFT:        { x: 1197, y: 279, w:   145, h:   59,livery:"Blanche" },
  CAR_CENTER_RIGHT:       { x: 1197, y: 212, w:   145, h:   59,livery:"Blanche" },
  CAR_CENTER_LEFT2:       { x: 1197, y: 551, w:   145, h:   59,livery:"Blanche" },
  CAR_CENTER_RIGHT2:      { x: 1197, y: 485, w:   145, h:   59,livery:"Blanche" },
  CAR_FRONT_LEFT:         { x: 1197, y: 405, w:   150, h:   55,livery:"Blanche" },
  CAR_FRONT:              { x: 1197, y: 145, w:   132, h: 54, livery:"Blanche" },
  CAR_FRONT_RIGHT:        { x: 1197, y: 346, w:   150, h:  56, livery:"Blanche" },
  BLANCHE_SPIN1:                { x: 5225, y:  926, w:  259, h:  65, livery:"Blanche" },
  BLANCHE_SPIN2:                 { x: 5225, y: 1003, w: 259, h:  65,livery:"Blanche" },
  BLANCHE_SPIN3:                 { x: 5225, y:  1086, w: 259, h:  65, livery:"Blanche" },
  BLANCHE_SPIN4:                  { x: 5225, y: 1174, w: 259, h:  65, livery:"Blanche" },
  BLANCHE_SPIN5:                 { x: 5225, y:  1261, w: 259, h:  65, livery:"Blanche" },
  BLANCHE_SPIN6:                  { x: 5225, y: 1352, w: 259, h:  65, livery:"Blanche" },
  
  
  MADONNA03:                  { x: 1058, y:  5, w:   132, h: 54, livery:"Madonna" },
  MADONNA02:                  { x: 1058, y:  70, w:  132, h:   54,livery:"Madonna" },
  MADONNA04:                  { x: 1058, y:  72, w:   132, h:  54,livery:"Madonna" },
  MADONNA01:                  { x: 1058, y: 5, w:   132, h:   52,livery:"Madonna" },
  MADONNA_CENTER_LEFT:        { x: 1058, y: 279, w:   137, h:   56,livery:"Madonna" },
  MADONNA_CENTER_RIGHT:       { x: 1058, y: 212, w:   137, h:   56,livery:"Madonna" },
  MADONNA_CENTER_LEFT2:        { x: 1058, y: 551, w:   137, h:   56,livery:"Madonna" },
  MADONNA_CENTER_RIGHT2:       { x: 1058, y: 485, w:   137, h:   56,livery:"Madonna" },
  MADONNA_FRONT_LEFT:         { x: 1046, y: 405, w:   150, h:   55,livery:"Madonna" },
  MADONNA_FRONT:              { x: 1058 ,y: 145, w:   145, h: 54, livery:"Madonna" },
  MADONNA_FRONT_RIGHT:        { x: 1046, y: 346, w:   150, h:  56, livery:"Madonna" },
  MADONNA_SPIN1:                { x: 4938, y:  926, w:  259, h:  65, livery:"Madonna" },
  MADONNA_SPIN2:                 { x: 4938, y: 1003, w: 259, h:  65,livery:"Madonna" },
  MADONNA_SPIN3:                 { x: 4938, y:  1086, w: 259, h:  65, livery:"Madonna" },
  MADONNA_SPIN4:                  { x: 4938, y: 1174, w: 259, h:  65, livery:"Madonna" },
  MADONNA_SPIN5:                 { x: 4938, y:  1261, w: 259, h:  65, livery:"Madonna" },
  MADONNA_SPIN6:                  { x: 4938, y: 1352, w: 259, h:  65, livery:"Madonna" },
  
  
  ORCHIS03:                  { x: 2574, y:  5, w:  160, h:  62, livery:"Orchis" },
  ORCHIS02:                  { x: 2574, y:  69, w:  160, h:   62,livery:"Orchis" },
  ORCHIS04:                  { x: 2574, y:  72, w:  160, h:  62, livery:"Orchis" },
  ORCHIS01:                  { x: 2574, y:  5, w:  160, h:  62, livery:"Orchis" },
  ORCHIS_CENTER_LEFT:        { x:2574, y: 277, w:   155, h:   60,livery:"Orchis" },
  ORCHIS_CENTER_RIGHT:      { x: 2574, y: 213, w:   155, h:   60,livery:"Orchis" },
  ORCHIS_CENTER_RIGHT2:        { x: 2574, y: 485, w:   155, h:   60,livery:"Orchis" },
  ORCHIS_CENTER_LEFT2:      { x: 2574, y: 550, w:   155, h:   60,livery:"Orchis" },
  ORCHIS_FRONT_LEFT:        { x: 2574,  y: 405, w:   150, h:   56, livery:"Orchis" },
  ORCHIS_FRONT:              { x: 2574, y: 145, w:   145, h:   54,  livery:"Orchis" },
  ORCHIS_FRONT_RIGHT:       { x: 2574, y: 346, w:   150, h:   55,livery:"Orchis" },
  ORCHIS_SPIN1:                { x: 2092, y:  926, w:  259, h:  65, livery:"Orchis" },
  ORCHIS_SPIN2:                 { x: 2092, y: 1003, w: 259, h:  65,livery:"Orchis" },
  ORCHIS_SPIN3:                 { x: 2092, y:  1086, w: 259, h:  65, livery:"Orchis" },
  ORCHIS_SPIN4:                  { x: 2092, y: 1174, w: 259, h:  65, livery:"Orchis" },
  ORCHIS_SPIN5:                 { x: 2092, y:  1261, w: 259, h:  65, livery:"Orchis" },
  ORCHIS_SPIN6:                  { x: 2092, y: 1352, w: 259, h:  65, livery:"Orchis" },
  
  
 
  PLAYER_STRAIGHT:        { x: 1384, y:  982, w:   80, h:   24 },
  CRASHED_LEFT:          { x:  1008, y:  927, w:  140, h:   24 },
  CRASHED_RIGHT:           { x:  1008, y:  963, w:  140, h:   24 },
  CRASHED_WHEEL1:         { x:  1184, y:  804, w:  50, h:   40 },
  CRASHED_WHEEL2:         { x:  1184, y:  845, w:  50, h:   40 },
  CRASHED_WHEEL3:         { x:  1184, y:  884, w:  50, h:   40 },
  CRASHED_WHEEL4:         { x:  1184, y:  926, w:  50, h:   40 },
  CRASHED_WHEEL5:         { x:  1184, y:  965, w:  50, h:   40 },
  CRASHED_WHEEL6:         { x:  1184, y:  1010, w:  50, h:   40 },
  WHEEL1:                 { x:  1310,y: 1086, w:   139, h:  17 },
  WHEEL2:                 { x:  1310,y: 1118, w:   139, h:  17 },
  WHEEL3:                 { x:  1310,y: 1148, w:   139, h:  17 },
  WHEEL3:                 { x:  1310,y: 1148, w:   139, h:  17 },
  WHEEL_CENTER_LEFT1:     { x:  1310,y: 1181, w:   139, h:  17 },
  WHEEL_CENTER_LEFT2:     { x:  1310,y: 1211, w:   139, h:  17 },
  WHEEL_CENTER_LEFT3:     { x:  1310,y: 1238, w:   139, h:  17 },
  WHEEL_LEFT1:            { x:  1310,y: 1267, w:   139, h:  17 },
  WHEEL_LEFT2:            { x:  1310,y: 1296, w:   139, h:  17 },
  WHEEL_LEFT3:            { x:  1310,y: 1324, w:   139, h:  17 },
  WHEEL_CENTER_RIGHT1:     { x:  1149,y: 1181, w:   139, h:  17 },
  WHEEL_CENTER_RIGHT2:     { x:  1149,y: 1211, w:   139, h:  17 },
  WHEEL_CENTER_RIGHT3:    { x:  1149,y: 1238, w:   139, h:  17 },
  WHEEL_RIGHT1:            { x:  1149,y: 1267, w:   139, h:  17 },
  WHEEL_RIGHT2:            { x:  1149,y: 1296, w:   139, h:  17 },
  WHEEL_RIGHT3:            { x:  1149,y: 1324, w:   139, h:  17 },
  STEERING_CENTER:         { x:  1010,y: 795, w:   47, h:  23 },
  STEERING_CENTER_LEFT1:   { x:  1010,y: 828, w:   47, h:  16 },
  STEERING_CENTER_LEFT2:   { x:  1010,y: 852, w:   47, h:  16 },
  STEERING_CENTER_LEFT3:   { x:  1010,y: 872, w:   47, h:  16 },
  STEERING_LEFT:           { x:  1010,y: 898, w:   47, h:  16 },
  STEERING_CENTER_RIGHT1:   { x:  1107,y: 828, w:   47, h:  16 },
  STEERING_CENTER_RIGHT2:   { x:  1107,y: 852, w:   47, h:  16 },
  STEERING_CENTER_RIGHT3:   { x:  1107,y: 872, w:   47, h:  16 },
  STEERING_RIGHT:           { x:  1107,y: 898, w:   47, h:  16 },
  FLAGMAN1:                  { x:  1240,y: 1348, w:   83, h:  128 },
  FLAGMAN2:                  { x:  1322,y: 1348, w:   83, h:  128},
  FLAGMAN3:                  { x:  1415,y: 1348, w:   83, h:  128 },
  TURN_LEFT:                  { x:  509 ,y: 1270, w:   55, h:  96 },
  TURN_RIGHT:                  { x:  509 ,y: 1376, w:   55, h:  96 },
  CHICANE_AHEAD:                  { x:  514 ,y: 1160, w:   46, h:  90 },
  WALL:                  { x:  775 ,y: 1070, w:   52, h:  250 }
  
};

SPRITES.SPIN_SEQUENCES = {

MINARAE:[SPRITES.MINARAE03, SPRITES.MINARAE_CENTER_LEFT2,SPRITES.MINARAE_SPIN6,SPRITES.MINARAE_SPIN1,SPRITES.MINARAE_SPIN2,
SPRITES.MINARAE_FRONT_RIGHT,SPRITES.MINARAE_FRONT,SPRITES.MINARAE_FRONT_LEFT,SPRITES.MINARAE_SPIN3,
SPRITES.MINARAE_SPIN4,SPRITES.MINARAE_SPIN5,SPRITES.MINARAE_CENTER_RIGHT2],

LOSEL:[SPRITES.LOSEL03, SPRITES.LOSEL_CENTER_LEFT2,SPRITES.LOSEL_SPIN6,SPRITES.LOSEL_SPIN1,SPRITES.LOSEL_SPIN2,
SPRITES.LOSEL_FRONT_RIGHT,SPRITES.LOSEL_FRONT,SPRITES.LOSEL_FRONT_LEFT,SPRITES.LOSEL_SPIN3,
SPRITES.LOSEL_SPIN4,SPRITES.LOSEL_SPIN5,SPRITES.LOSEL_CENTER_RIGHT2],

ZEROFORCE:[SPRITES.ZEROFORCE03, SPRITES.ZEROFORCE_CENTER_LEFT2,SPRITES.ZEROFORCE_SPIN6,SPRITES.ZEROFORCE_SPIN1,SPRITES.ZEROFORCE_SPIN2,
SPRITES.ZEROFORCE_FRONT_RIGHT,SPRITES.ZEROFORCE_FRONT,SPRITES.ZEROFORCE_FRONT_LEFT,SPRITES.ZEROFORCE_SPIN3,
SPRITES.ZEROFORCE_SPIN4,SPRITES.ZEROFORCE_SPIN5,SPRITES.ZEROFORCE_CENTER_RIGHT2],

ORCHIS:[SPRITES.ORCHIS03, SPRITES.ORCHIS_CENTER_LEFT2,SPRITES.ORCHIS_SPIN6,SPRITES.ORCHIS_SPIN1,SPRITES.ORCHIS_SPIN2,
SPRITES.ORCHIS_FRONT_RIGHT,SPRITES.ORCHIS_FRONT,SPRITES.ORCHIS_FRONT_LEFT,SPRITES.ORCHIS_SPIN3,
SPRITES.ORCHIS_SPIN4,SPRITES.ORCHIS_SPIN5,SPRITES.ORCHIS_CENTER_RIGHT2],


LINDEN:[SPRITES.LINDEN03, SPRITES.LINDEN_CENTER_LEFT2,SPRITES.LINDEN_SPIN6,SPRITES.LINDEN_SPIN1,SPRITES.LINDEN_SPIN2,
SPRITES.LINDEN_FRONT_RIGHT,SPRITES.LINDEN_FRONT,SPRITES.LINDEN_FRONT_LEFT,SPRITES.LINDEN_SPIN3,
SPRITES.LINDEN_SPIN4,SPRITES.LINDEN_SPIN5,SPRITES.LINDEN_CENTER_RIGHT2],

DARDAN:[SPRITES.DARDAN03, SPRITES.DARDAN_CENTER_LEFT2,SPRITES.DARDAN_SPIN6,SPRITES.DARDAN_SPIN1,SPRITES.DARDAN_SPIN2,
SPRITES.DARDAN_FRONT_RIGHT,SPRITES.DARDAN_FRONT,SPRITES.DARDAN_FRONT_LEFT,SPRITES.DARDAN_SPIN3,
SPRITES.DARDAN_SPIN4,SPRITES.DARDAN_SPIN5,SPRITES.DARDAN_CENTER_RIGHT2],

BULLETS:[SPRITES.BULLETS03, SPRITES.BULLETS_CENTER_LEFT2,SPRITES.BULLETS_SPIN6,SPRITES.BULLETS_SPIN1,SPRITES.BULLETS_SPIN2,
SPRITES.BULLETS_FRONT_RIGHT,SPRITES.BULLETS_FRONT,SPRITES.BULLETS_FRONT_LEFT,SPRITES.BULLETS_SPIN3,
SPRITES.BULLETS_SPIN4,SPRITES.BULLETS_SPIN5,SPRITES.BULLETS_CENTER_RIGHT2],

MAY:[SPRITES.MAY03, SPRITES.MAY_CENTER_LEFT2,SPRITES.MAY_SPIN6,SPRITES.MAY_SPIN1,SPRITES.MAY_SPIN2,
SPRITES.MAY_FRONT_RIGHT,SPRITES.MAY_FRONT,SPRITES.MAY_FRONT_LEFT,SPRITES.MAY_SPIN3,
SPRITES.MAY_SPIN4,SPRITES.MAY_SPIN5,SPRITES.MAY_CENTER_RIGHT2],

TYRANT:[SPRITES.TYRANT03, SPRITES.TYRANT_CENTER_LEFT2,SPRITES.TYRANT_SPIN6,SPRITES.TYRANT_SPIN1,SPRITES.TYRANT_SPIN2,
SPRITES.TYRANT_FRONT_RIGHT,SPRITES.TYRANT_FRONT,SPRITES.TYRANT_FRONT_LEFT,SPRITES.TYRANT_SPIN3,
SPRITES.TYRANT_SPIN4,SPRITES.TYRANT_SPIN5,SPRITES.TYRANT_CENTER_RIGHT2],

BESTOWAL:[SPRITES.BESTOWAL03, SPRITES.BESTOWAL_CENTER_LEFT2,SPRITES.BESTOWAL_SPIN6,SPRITES.BESTOWAL_SPIN1,SPRITES.BESTOWAL_SPIN2,
SPRITES.BESTOWAL_FRONT_RIGHT,SPRITES.BESTOWAL_FRONT,SPRITES.BESTOWAL_FRONT_LEFT,SPRITES.BESTOWAL_SPIN3,
SPRITES.BESTOWAL_SPIN4,SPRITES.BESTOWAL_SPIN5,SPRITES.BESTOWAL_CENTER_RIGHT2],



MILLIONS:[SPRITES.MILLIONS03, SPRITES.MILLIONS_CENTER_LEFT2,SPRITES.MILLIONS_SPIN6,SPRITES.MILLIONS_SPIN1,SPRITES.MILLIONS_SPIN2,
SPRITES.MILLIONS_FRONT_RIGHT,SPRITES.MILLIONS_FRONT,SPRITES.MILLIONS_FRONT_LEFT,SPRITES.MILLIONS_SPIN3,
SPRITES.MILLIONS_SPIN4,SPRITES.MILLIONS_SPIN5,SPRITES.MILLIONS_CENTER_RIGHT2],

FIRENZE:[SPRITES.FIRENZE03, SPRITES.FIRENZE_CENTER_LEFT2,SPRITES.FIRENZE_SPIN6,SPRITES.FIRENZE_SPIN1,SPRITES.FIRENZE_SPIN2,
SPRITES.FIRENZE_FRONT_RIGHT,SPRITES.FIRENZE_FRONT,SPRITES.FIRENZE_FRONT_LEFT,SPRITES.FIRENZE_SPIN3,
SPRITES.FIRENZE_SPIN4,SPRITES.FIRENZE_SPIN5,SPRITES.FIRENZE_CENTER_RIGHT2],

MADONNA:[SPRITES.MADONNA03, SPRITES.MADONNA_CENTER_LEFT2,SPRITES.MADONNA_SPIN6,SPRITES.MADONNA_SPIN1,SPRITES.MADONNA_SPIN2,
SPRITES.MADONNA_FRONT_RIGHT,SPRITES.MADONNA_FRONT,SPRITES.MADONNA_FRONT_LEFT,SPRITES.MADONNA_SPIN3,
SPRITES.MADONNA_SPIN4,SPRITES.MADONNA_SPIN5,SPRITES.MADONNA_CENTER_RIGHT2],

RIGEL:[SPRITES.RIGEL03, SPRITES.RIGEL_CENTER_LEFT2,SPRITES.RIGEL_SPIN6,SPRITES.RIGEL_SPIN1,SPRITES.RIGEL_SPIN2,
SPRITES.RIGEL_FRONT_RIGHT,SPRITES.RIGEL_FRONT,SPRITES.RIGEL_FRONT_LEFT,SPRITES.RIGEL_SPIN3,
SPRITES.RIGEL_SPIN4,SPRITES.RIGEL_SPIN5,SPRITES.RIGEL_CENTER_RIGHT2],

BLANCHE:[SPRITES.CAR03, SPRITES.CAR_CENTER_LEFT2,SPRITES.BLANCHE_SPIN6,SPRITES.BLANCHE_SPIN1,SPRITES.BLANCHE_SPIN2,
SPRITES.CAR_FRONT_RIGHT,SPRITES.CAR_FRONT,SPRITES.CAR_FRONT_LEFT,SPRITES.BLANCHE_SPIN3,
SPRITES.BLANCHE_SPIN4,SPRITES.BLANCHE_SPIN5,SPRITES.CAR_CENTER_RIGHT2],

  COMET:[SPRITES.COMET03, SPRITES.COMET_CENTER_LEFT2,SPRITES.COMET_SPIN6,SPRITES.COMET_SPIN1,SPRITES.COMET_SPIN2,
SPRITES.COMET_FRONT_RIGHT,SPRITES.COMET_FRONT,SPRITES.COMET_FRONT_LEFT,SPRITES.COMET_SPIN3,
SPRITES.COMET_SPIN4,SPRITES.COMET_SPIN5,SPRITES.COMET_CENTER_RIGHT2]


};

SPRITES.SCALE = 0.3 * (1/SPRITES.PLAYER_STRAIGHT.w) // the reference sprite width should be 1/3rd the (half-)roadWidth

SPRITES.BILLBOARDS = [ SPRITES.BILLBOARD02, SPRITES.BILLBOARD03, SPRITES.BILLBOARD04, SPRITES.BILLBOARD05, SPRITES.BILLBOARD06, SPRITES.BILLBOARD07,SPRITES.BILLBOARD08, SPRITES.BILLBOARD09];
SPRITES.PLANTS     = [SPRITES.BUSH1];

SPRITES.CRASH      = [ SPRITES.CRASHED_WHEEL1,  SPRITES.CRASHED_WHEEL2, SPRITES.CRASHED_WHEEL3, SPRITES.CRASHED_WHEEL4, SPRITES.CRASHED_WHEEL5, SPRITES.CRASHED_WHEEL6];

SPRITES.CARS       = [[SPRITES.CAR01 ,SPRITES.CAR02   ,SPRITES.CAR03   , SPRITES.CAR04  , SPRITES.CAR_CENTER_LEFT   ,SPRITES.CAR_CENTER_RIGHT   ,SPRITES.CAR_FRONT_LEFT  ,SPRITES.CAR_FRONT ,SPRITES.CAR_FRONT_RIGHT, SPRITES.CAR_CENTER_LEFT2   ,SPRITES.CAR_CENTER_RIGHT2],

[SPRITES.LOSEL01 ,SPRITES.LOSEL02   ,SPRITES.LOSEL03   , SPRITES.LOSEL04  , SPRITES.LOSEL_CENTER_LEFT   ,SPRITES.LOSEL_CENTER_RIGHT   ,SPRITES.LOSEL_FRONT_LEFT  ,SPRITES.LOSEL_FRONT ,SPRITES.LOSEL_FRONT_RIGHT, SPRITES.LOSEL_CENTER_LEFT2   ,SPRITES.LOSEL_CENTER_RIGHT2],


[SPRITES.DARDAN01 ,SPRITES.DARDAN02   ,SPRITES.DARDAN03   , SPRITES.DARDAN04  , SPRITES.DARDAN_CENTER_LEFT   ,SPRITES.DARDAN_CENTER_RIGHT   ,SPRITES.DARDAN_FRONT_LEFT  ,SPRITES.DARDAN_FRONT ,SPRITES.DARDAN_FRONT_RIGHT, SPRITES.DARDAN_CENTER_LEFT2   ,SPRITES.DARDAN_CENTER_RIGHT2],


  
[SPRITES.BULLETS01 ,SPRITES.BULLETS02   ,SPRITES.BULLETS03   , SPRITES.BULLETS04  , SPRITES.BULLETS_CENTER_LEFT   ,SPRITES.BULLETS_CENTER_RIGHT   ,SPRITES.BULLETS_FRONT_LEFT  ,SPRITES.BULLETS_FRONT ,SPRITES.BULLETS_FRONT_RIGHT, SPRITES.BULLETS_CENTER_LEFT2   ,SPRITES.BULLETS_CENTER_RIGHT2],


[SPRITES.BESTOWAL01 ,SPRITES.BESTOWAL02   ,SPRITES.BESTOWAL03   , SPRITES.BESTOWAL04  , SPRITES.BESTOWAL_CENTER_LEFT   ,SPRITES.BESTOWAL_CENTER_RIGHT   ,SPRITES.BESTOWAL_FRONT_LEFT  ,SPRITES.BESTOWAL_FRONT ,SPRITES.BESTOWAL_FRONT_RIGHT, SPRITES.BESTOWAL_CENTER_LEFT2   ,SPRITES.BESTOWAL_CENTER_RIGHT2],


[SPRITES.LINDEN01 ,SPRITES.LINDEN02   ,SPRITES.LINDEN03   , SPRITES.LINDEN04  , SPRITES.LINDEN_CENTER_LEFT   ,SPRITES.LINDEN_CENTER_RIGHT   ,SPRITES.LINDEN_FRONT_LEFT  ,SPRITES.LINDEN_FRONT ,SPRITES.LINDEN_FRONT_RIGHT, SPRITES.LINDEN_CENTER_LEFT2   ,SPRITES.LINDEN_CENTER_RIGHT2],


[SPRITES.COMET01 ,SPRITES.COMET02   ,SPRITES.COMET03   , SPRITES.COMET04  , SPRITES.COMET_CENTER_LEFT   ,SPRITES.COMET_CENTER_RIGHT   ,SPRITES.COMET_FRONT_LEFT  ,SPRITES.COMET_FRONT ,SPRITES.COMET_FRONT_RIGHT, SPRITES.COMET_CENTER_LEFT2   ,SPRITES.COMET_CENTER_RIGHT2],


[SPRITES.MAY01 ,SPRITES.MAY02   ,SPRITES.MAY03   , SPRITES.MAY04  , SPRITES.MAY_CENTER_LEFT   ,SPRITES.MAY_CENTER_RIGHT   ,SPRITES.MAY_FRONT_LEFT  ,SPRITES.MAY_FRONT ,SPRITES.MAY_FRONT_RIGHT, SPRITES.MAY_CENTER_LEFT2   ,SPRITES.MAY_CENTER_RIGHT2],

[SPRITES.TYRANT01 ,SPRITES.TYRANT02   ,SPRITES.TYRANT03   , SPRITES.TYRANT04  , SPRITES.TYRANT_CENTER_LEFT   ,SPRITES.TYRANT_CENTER_RIGHT   ,SPRITES.TYRANT_FRONT_LEFT  ,SPRITES.TYRANT_FRONT ,SPRITES.TYRANT_FRONT_RIGHT, SPRITES.TYRANT_CENTER_LEFT2   ,SPRITES.TYRANT_CENTER_RIGHT2],

 [SPRITES.MADONNA01 ,SPRITES.MADONNA02   ,SPRITES.MADONNA03   , SPRITES.MADONNA04  , SPRITES.MADONNA_CENTER_LEFT   ,SPRITES.MADONNA_CENTER_RIGHT   ,SPRITES.MADONNA_FRONT_LEFT  ,SPRITES.MADONNA_FRONT ,SPRITES.MADONNA_FRONT_RIGHT, SPRITES.MADONNA_CENTER_LEFT2   ,SPRITES.MADONNA_CENTER_RIGHT2],
 
 
 [SPRITES.MILLIONS01 ,SPRITES.MILLIONS02   ,SPRITES.MILLIONS03   , SPRITES.MILLIONS04  , SPRITES.MILLIONS_CENTER_LEFT   ,SPRITES.MILLIONS_CENTER_RIGHT   ,SPRITES.MILLIONS_FRONT_LEFT  ,SPRITES.MILLIONS_FRONT ,SPRITES.MILLIONS_FRONT_RIGHT , SPRITES.MILLIONS_CENTER_LEFT2   ,SPRITES.MILLIONS_CENTER_RIGHT2 ],
 
 
  [SPRITES.ZEROFORCE01 ,SPRITES.ZEROFORCE02   ,SPRITES.ZEROFORCE03   , SPRITES.ZEROFORCE04  , SPRITES.ZEROFORCE_CENTER_LEFT   ,SPRITES.ZEROFORCE_CENTER_RIGHT   ,SPRITES.ZEROFORCE_FRONT_LEFT  ,SPRITES.ZEROFORCE_FRONT ,SPRITES.ZEROFORCE_FRONT_RIGHT, SPRITES.ZEROFORCE_CENTER_LEFT2   ,SPRITES.ZEROFORCE_CENTER_RIGHT2 ],
 
 
  [SPRITES.RIGEL01 ,SPRITES.RIGEL02   ,SPRITES.RIGEL03   , SPRITES.RIGEL04  , SPRITES.RIGEL_CENTER_LEFT   ,SPRITES.RIGEL_CENTER_RIGHT   ,SPRITES.RIGEL_FRONT_LEFT  ,SPRITES.RIGEL_FRONT ,SPRITES.RIGEL_FRONT_RIGHT ,SPRITES.RIGEL_CENTER_LEFT2,SPRITES.RIGEL_CENTER_RIGHT2 ],
 
 [SPRITES.ORCHIS01 ,SPRITES.ORCHIS02   ,SPRITES.ORCHIS03   , SPRITES.ORCHIS04  , SPRITES.ORCHIS_CENTER_LEFT  ,SPRITES.ORCHIS_CENTER_RIGHT,SPRITES.ORCHIS_FRONT_LEFT  ,SPRITES.ORCHIS_FRONT ,SPRITES.ORCHIS_FRONT_RIGHT ,SPRITES.ORCHIS_CENTER_LEFT2,SPRITES.ORCHIS_CENTER_RIGHT2 ],
 
  [SPRITES.MINARAE01 ,SPRITES.MINARAE02   ,SPRITES.MINARAE03   , SPRITES.MINARAE04  , SPRITES.MINARAE_CENTER_LEFT   ,SPRITES.MINARAE_CENTER_RIGHT   ,SPRITES.MINARAE_FRONT_LEFT  ,SPRITES.MINARAE_FRONT ,SPRITES.MINARAE_FRONT_RIGHT , SPRITES.MINARAE_CENTER_LEFT2   ,SPRITES.MINARAE_CENTER_RIGHT2],
  

 
  [SPRITES.FIRENZE01 ,SPRITES.FIRENZE02   ,SPRITES.FIRENZE03   , SPRITES.FIRENZE04  , SPRITES.FIRENZE_CENTER_LEFT   ,SPRITES.FIRENZE_CENTER_RIGHT   ,SPRITES.FIRENZE_FRONT_LEFT  ,SPRITES.FIRENZE_FRONT ,SPRITES.FIRENZE_FRONT_RIGHT , SPRITES.FIRENZE_CENTER_LEFT2   ,SPRITES.FIRENZE_CENTER_RIGHT2]];
