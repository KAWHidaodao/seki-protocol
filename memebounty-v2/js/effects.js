(function(){
  var c=document.getElementById('neural-canvas');
  if(!c)return;
  var ctx=c.getContext('2d');
  var W,H,nodes=[];
  function resize(){
    W=c.width=window.innerWidth;
    H=c.height=window.innerHeight;
  }
  resize();
  window.addEventListener('resize',resize,{passive:true});
  // Generate sparse nodes
  function init(){
    nodes=[];
    var n=Math.floor(W*H/18000);
    for(var i=0;i<n;i++){
      nodes.push({
        x:Math.random()*W,
        y:Math.random()*H,
        vx:(Math.random()-.5)*.18,
        vy:(Math.random()-.5)*.18,
        r:Math.random()*1.2+.4
      });
    }
  }
  init();
  var CONN=120; // max connection distance
  function draw(){
    ctx.clearRect(0,0,W,H);
    // Update
    for(var i=0;i<nodes.length;i++){
      var n=nodes[i];
      n.x+=n.vx; n.y+=n.vy;
      if(n.x<0||n.x>W) n.vx*=-1;
      if(n.y<0||n.y>H) n.vy*=-1;
    }
    // Draw connections
    for(var i=0;i<nodes.length;i++){
      for(var j=i+1;j<nodes.length;j++){
        var dx=nodes[i].x-nodes[j].x;
        var dy=nodes[i].y-nodes[j].y;
        var d=Math.sqrt(dx*dx+dy*dy);
        if(d<CONN){
          var alpha=(1-d/CONN)*0.18;
          ctx.beginPath();
          ctx.strokeStyle='rgba(167,139,250,'+alpha+')';
          ctx.lineWidth=.5;
          ctx.moveTo(nodes[i].x,nodes[i].y);
          ctx.lineTo(nodes[j].x,nodes[j].y);
          ctx.stroke();
        }
      }
    }
    // Draw nodes
    for(var i=0;i<nodes.length;i++){
      ctx.beginPath();
      ctx.arc(nodes[i].x,nodes[i].y,nodes[i].r,0,Math.PI*2);
      ctx.fillStyle='rgba(167,139,250,.5)';
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  draw();
})();

(function(){
  var c=document.getElementById('star-canvas');
  if(!c)return;
  var ctx=c.getContext('2d');
  var stars=[];
  function resize(){c.width=innerWidth;c.height=innerHeight;}
  resize();window.addEventListener('resize',resize);
  for(var i=0;i<120;i++){
    stars.push({x:Math.random(),y:Math.random(),r:Math.random()*1.2+.2,a:Math.random(),da:(Math.random()-.5)*.003,s:Math.random()*0.4+0.1});
  }
  function draw(){
    ctx.clearRect(0,0,c.width,c.height);
    stars.forEach(function(s){
      s.a+=s.da;if(s.a<0||s.a>1)s.da*=-1;
      ctx.beginPath();
      ctx.arc(s.x*c.width,s.y*c.height,s.r,0,Math.PI*2);
      ctx.fillStyle='rgba(200,185,255,'+s.a.toFixed(2)+')';
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
})();

// Nav scroll transparency
(function(){
  var nav = document.querySelector('.nav');
  if(!nav) return;
  window.addEventListener('scroll', function(){
    nav.classList.toggle('scrolled', window.scrollY > 20);
  }, {passive: true});
})();