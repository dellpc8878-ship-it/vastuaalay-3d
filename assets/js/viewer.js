import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

// Architectural preview: geometry follows detected room polygons.
// Furniture is deliberately illustrative; it is NOT claimed to be detected from the drawing.
const WALL_HEIGHT=1.77;
const TYPES={
  living:{label:'Hall',floor:'#e5bfa0',grout:'#fff3e5'},
  bedroom:{label:'Bedroom',floor:'#d6b4a1',grout:'#f4e6d7'},
  kitchen:{label:'Kitchen',floor:'#c4d7c4',grout:'#f1f6ed'},
  bathroom:{label:'Bathroom',floor:'#a9d6e2',grout:'#e8f8fa'},
  puja:{label:'Puja Room',floor:'#e8d393',grout:'#fff3d8'},
  dining:{label:'Dining',floor:'#edc9a8',grout:'#fff2e4'},
  stairs:{label:'Stairs',floor:'#aab1b8',grout:'#f3f5f4'},
  balcony:{label:'Open Area',floor:'#b4d5a9',grout:'#e8f5df'},
  parking:{label:'Parking',floor:'#b1b7c0',grout:'#f4f5f6'},
  store:{label:'Store',floor:'#e5dacb',grout:'#fff3e4'},
  unknown:{label:'Unknown Area',floor:'#dbd6ca',grout:'#f3f2e9'},
  other:{label:'Room',floor:'#e2ded7',grout:'#f4f0ea'}
};
function mat(color,roughness=.78,metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness,side:THREE.DoubleSide})}
const M={
  wall:mat('#fff6ed'),wallTrim:mat('#565b61'),door:mat('#925c35'),wood:mat('#9d704a'),woodLight:mat('#ca9b72'),
  woodDark:mat('#67503d'),sofa:mat('#e5d8c6'),sofa2:mat('#9fb7aa'),bed:mat('#f7f5f1'),blanket:mat('#709ca9'),
  pillow:mat('#fffdf8'),rug:mat('#dfc1a1'),metal:mat('#a7afb6',.3,.6),black:mat('#353b41',.32),glass:mat('#c8e1e6',.2,.1),
  marble:mat('#eee9e4',.27),gold:mat('#d39e4d',.36,.4),green:mat('#348354'),plantPot:mat('#bf7860'),
  white:mat('#f8f7f5'),water:mat('#b9dce3'),floorBase:mat('#e8decb'),outline:mat('#978d81'),
  turf:mat('#77bd89'),turfDark:mat('#42956a'),ground:mat('#a6c8ae'),path:mat('#b1b8ad'),soil:mat('#997851'),flower:mat('#f1ac79'),lamp:mat('#ffe6a4',.3)
};
function box(group,m,w,h,d,x=0,y=0,z=0,cast=true){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(Math.max(.012,w),Math.max(.012,h),Math.max(.012,d)),m);
  mesh.position.set(x,y,z);mesh.castShadow=cast;mesh.receiveShadow=true;group.add(mesh);return mesh;
}
function cyl(group,m,rTop,rBottom,h,x,y,z,segments=16){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(rTop,rBottom,h,segments),m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh}
function sphere(group,m,r,x,y,z){const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,12,10),m);mesh.position.set(x,y,z);mesh.castShadow=true;group.add(mesh);return mesh;}
function polygon(room,W,D){return room.polygon.map(p=>[Math.max(0,Math.min(1,+p[0]))*W,Math.max(0,Math.min(1,+p[1]))*D]);}
function centroid(poly){let a=0,cx=0,cz=0;for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],c=p[0]*q[1]-q[0]*p[1];a+=c;cx+=(p[0]+q[0])*c;cz+=(p[1]+q[1])*c;}if(Math.abs(a)>1e-5)return [cx/(3*a),cz/(3*a)];return poly.reduce((acc,p)=>[acc[0]+p[0]/poly.length,acc[1]+p[1]/poly.length],[0,0]);}
function extent(poly){const xs=poly.map(p=>p[0]),zs=poly.map(p=>p[1]);return {xmin:Math.min(...xs),xmax:Math.max(...xs),zmin:Math.min(...zs),zmax:Math.max(...zs),w:Math.max(...xs)-Math.min(...xs),d:Math.max(...zs)-Math.min(...zs)};}
function floorTexture(type){
  const {floor,grout}=TYPES[type]||TYPES.other;
  const can=document.createElement('canvas');can.width=256;can.height=256;const c=can.getContext('2d');
  c.fillStyle=grout;c.fillRect(0,0,256,256);
  const isWood=['bedroom','living','dining','puja','store'].includes(type);
  if(isWood){
    for(let row=0;row<8;row++){
      const shift=(row%2)*36;const y=row*32;
      for(let x=-75+shift;x<258;x+=74){
        c.fillStyle=floor;c.fillRect(x+2,y+2,70,28);
        c.strokeStyle='rgba(117,89,70,.08)';c.strokeRect(x+3,y+3,68,26);
        for(let k=0;k<3;k++){c.strokeStyle='rgba(130,97,63,.035)';c.beginPath();c.moveTo(x+7,y+7+k*5);c.lineTo(x+60,y+8+k*5);c.stroke();}
      }
    }
  }else{
    for(let y=0;y<256;y+=64)for(let x=0;x<256;x+=64){c.fillStyle=floor;c.fillRect(x+2,y+2,60,60);c.strokeStyle='rgba(125,112,105,.055)';c.strokeRect(x+3,y+3,58,58);}
  }
  const tx=new THREE.CanvasTexture(can);tx.wrapS=tx.wrapT=THREE.RepeatWrapping;tx.repeat.set(isWood?.7:1.1,isWood?.7:1.1);tx.colorSpace=THREE.SRGBColorSpace;tx.anisotropy=4;return tx;
}
function buildFloor(group,poly,type,highlight=false){
  // Shape XY is (world X, -world Z). Rotate by -90° to place at world +Z.
  const s=new THREE.Shape();poly.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z));s.closePath();
  const tex=floorTexture(type);const fm=new THREE.MeshStandardMaterial({map:tex,roughness:.8,side:THREE.DoubleSide});
  const tile=new THREE.Mesh(new THREE.ShapeGeometry(s),fm);tile.rotation.x=-Math.PI/2;tile.position.y=.013;tile.receiveShadow=true;group.add(tile);
  const floorOutline=new THREE.Line(new THREE.BufferGeometry().setFromPoints([...poly.map(([x,z])=>new THREE.Vector3(x,.045,z)),new THREE.Vector3(poly[0][0],.045,poly[0][1])]),new THREE.LineBasicMaterial({color:highlight?0x3d9e68:0x9e8774,transparent:true,opacity:.50}));group.add(floorOutline);
}
function makeWall(group,a,b){
  const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.075)return;
  const rot=-Math.atan2(dz,dx),x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;
  const main=box(group,M.wall,length,WALL_HEIGHT,.12,x,WALL_HEIGHT/2,z);main.rotation.y=rot;
  const trim=box(group,M.wallTrim,length,.075,.15,x,WALL_HEIGHT+.022,z);trim.rotation.y=rot;
  const skirting=box(group,M.woodLight,length,.065,.145,x,.035,z);skirting.rotation.y=rot;
}
function housePlant(g,x,z,k=1){
  cyl(g,M.plantPot,.15*k,.12*k,.30*k,x,.17*k,z);cyl(g,M.green,.027*k,.027*k,.40*k,x,.5*k,z);
  for(const [dx,dz] of [[.19,0],[-.15,.14],[.08,-.18],[-.18,-.13]]){
    const l=sphere(g,M.green,.17*k,x+dx*k,.68*k,z+dz*k);l.scale.set(1,.5,.75);
  }
}
// These are decorative preview elements, not automatically detected features.
function landscape(root,W,D){
  box(root,M.turf,W+5,.11,D+5,W/2,-.44,D/2,false);
  box(root,M.ground,W+1.05,.16,D+1.05,W/2,-.32,D/2,false);
  box(root,M.floorBase,W+.24,.13,D+.24,W/2,-.19,D/2,false);
  // A soft landscaping rim around the detected footprint.
  for(const x of [-1.30,W+1.30])for(let j=0;j<8;j++){
    const z=D*(j+.5)/8;
    if(j%3===0){housePlant(root,x,z,.95);}else{
      cyl(root,M.soil,.34,.38,.13,x,-.25,z);
      const b=sphere(root,M.turfDark,.38,x,-.01,z);b.scale.y=.60;
      if(j%4===1)sphere(root,M.flower,.105,x+.10,.25,z);
    }
  }
  for(let i=0;i<9;i++){
    const x=W*(i+.5)/9;
    for(const z of [-1.35,D+1.35]){
      if(i%3===0)housePlant(root,x,z,.65);
      else{const p=sphere(root,M.turfDark,.31,x,-.20,z);p.scale.y=.50;}
    }
  }
  // Lamp posts at exterior corners. They do not claim to be in the uploaded map.
  for(const x of [-.72,W+.72])for(const z of [-.72,D+.72]){
     cyl(root,M.woodDark,.075,.10,.85,x,.22,z);
     sphere(root,M.lamp,.17,x,.72,z);
  }
}
function addBed(g){
  box(g,M.woodDark,2.40,.13,2.88,0,.17,0);
  for(const x of [-.95,.95])for(const z of [-1.18,1.18])box(g,M.wood,.10,.23,.1,x,.16,z);
  box(g,M.bed,2.18,.27,2.63,0,.40,0);
  box(g,M.woodLight,2.40,.8,.16,0,.68,-1.39);
  box(g,M.blanket,2.23,.085,1.45,0,.59,.50);
  box(g,M.pillow,.91,.13,.48,-.55,.63,-.84);box(g,M.pillow,.91,.13,.48,.55,.63,-.84);
  for(const x of [-1.40,1.40]){box(g,M.wood,.44,.42,.50,x,.21,-.98);box(g,M.marble,.50,.04,.53,x,.45,-.98);}
  box(g,M.rug,2.92,.014,3.12,0,.014,.22,false);
}
function addLiving(g){
  box(g,M.rug,3.5,.018,2.7,0,.021,.16,false);
  box(g,M.sofa,2.55,.34,.79,0,.32,-.82);box(g,M.sofa,2.55,.65,.22,0,.67,-1.15);
  for(const x of [-.76,0,.76])box(g,M.sofa2,.68,.14,.52,x,.56,-.75);
  for(const x of [-1.34,1.34])box(g,M.sofa,.19,.54,.82,x,.48,-.80);
  box(g,M.woodLight,1.35,.10,.75,0,.42,.64);for(const x of [-.52,.52])for(const z of [.38,.91])box(g,M.woodDark,.07,.40,.07,x,.20,z);
  box(g,M.wood,1.78,.45,.35,0,.27,1.70);box(g,M.black,1.30,.72,.06,0,.91,1.74);
  housePlant(g,1.63,-1.31,.85);
}
function addKitchen(g){
  box(g,M.woodLight,3.30,.86,.62,0,.43,-1.39);box(g,M.marble,3.39,.09,.74,0,.90,-1.39);
  box(g,M.woodLight,.67,1.25,1.75,-1.30,.63,-.25);box(g,M.marble,.76,.09,1.83,-1.30,1.29,-.25);
  // Cooktop and burners.
  box(g,M.black,.90,.045,.53,.80,.968,-1.39);
  for(const x of [.51,1.05])for(const z of [-1.53,-1.23])cyl(g,M.metal,.11,.11,.025,x,1.00,z,16);
  // Sink.
  box(g,M.metal,.62,.016,.39,-.48,.966,-1.41);box(g,M.glass,.43,.022,.21,-.48,.978,-1.41);
  // Refrigerator.
  box(g,M.metal,.70,1.74,.72,1.34,.87,1.06);box(g,M.white,.035,.07,.60,1.00,1.28,1.40);
  box(g,M.woodDark,2.55,.36,.37,-.18,1.85,-1.48);
}
function addBath(g){
  box(g,M.rug,2.5,.013,2.7,0,.015,0,false);
  box(g,M.white,.75,.44,1.05,-.85,.32,-.60);box(g,M.white,.62,.32,.60,-.85,.72,-.86);
  box(g,M.marble,.89,.76,.55,.83,.38,-.75);
  box(g,M.white,.68,.16,.52,.82,.80,-.75);
  box(g,M.glass,1.06,.08,1.03,.75,.07,.79);box(g,M.metal,.08,1.47,.08,1.25,.75,.95);
}
function addPuja(g){
  box(g,M.rug,2.0,.013,2.4,0,.013,.05,false);
  box(g,M.wood,1.66,.75,.87,0,.40,-.32);box(g,M.marble,1.78,.06,.94,0,.79,-.32);
  box(g,M.woodDark,1.82,.17,.25,0,1.71,-.73);
  for(const x of [-.77,.77])box(g,M.woodLight,.08,1.02,.08,x,1.27,-.68);
  cyl(g,M.gold,.20,.24,.53,0,1.09,-.35);
  sphere(g,M.gold,.21,0,1.48,-.35);
  cyl(g,M.gold,.11,.10,.12,-.55,.94,-.13);cyl(g,M.gold,.11,.10,.12,.55,.94,-.13);
  housePlant(g,1.33,1.19,.60);
}
function addDining(g){
  box(g,M.rug,3.4,.015,2.55,0,.014,0,false);
  box(g,M.wood,2.22,.13,1.30,0,.78,0);
  for(const x of [-.74,.74])for(const z of [-.88,.88]){box(g,M.woodLight,.53,.38,.52,x,.36,z);box(g,M.wood,.55,.56,.14,x,.66,z+(z>0?.27:-.27));}
}
function addStairs(g){for(let k=0;k<9;k++)box(g,M.marble,1.58,.13+k*.16,.32,0,(.13+k*.16)/2,-1.43+k*.35);}
function addStore(g){for(const y of [.44,.92,1.42])box(g,M.wood,2.40,.12,.57,0,y,-1.0);for(const x of [-.7,.5])box(g,M.woodLight,.45,.37,.4,x,.27,-1.02)}
function addBalcony(g){housePlant(g,-.98,-.80,.8);housePlant(g,.95,-.82,.9);box(g,M.woodLight,1.22,.1,.55,0,.41,.48)}
function addParking(g){box(g,M.metal,1.55,.48,2.45,0,.48,0);box(g,M.glass,1.34,.39,1.17,0,.90,-.27);for(const x of [-.82,.82])for(const z of [-.80,.80]){const wheel=cyl(g,M.black,.29,.29,.17,x,.26,z);wheel.rotation.z=Math.PI/2;}}
function addFurniture(group,type,poly){
  const b=extent(poly);if(b.w<.95||b.d<.95)return;
  const [cx,cz]=centroid(poly);
  // Adapt to each detected footprint. The scanner does not extract furniture positions.
  const scale=Math.min(1.0,b.w/4.1,b.d/4.1);
  if(scale<.23)return;
  const g=new THREE.Group();g.position.set(cx,0,cz);g.scale.setScalar(Math.max(.23,scale));group.add(g);
  if(type==='bedroom')addBed(g);
  else if(type==='living')addLiving(g);
  else if(type==='kitchen')addKitchen(g);
  else if(type==='bathroom')addBath(g);
  else if(type==='puja')addPuja(g);
  else if(type==='dining')addDining(g);
  else if(type==='stairs')addStairs(g);
  else if(type==='store')addStore(g);
  else if(type==='balcony')addBalcony(g);
  else if(type==='parking')addParking(g);
}
function displayName(r,i){
  const name=String(r.name||'').trim();
  if(r.type==='unknown')return `क्षेत्र ${i+1}`;
  if(!name||/^(room|unidentified|area)\s*\d+/i.test(name)||/confirm/i.test(name))return (TYPES[r.type]||TYPES.other).label;
  return name.slice(0,28);
}
export class HouseViewer {
  constructor(host){this.host=host;this.renderer=null;this.controls=null;this.camera=null;this.scene=null;this.frame=null;this.tags=[];this.resizeObserver=null;this.W=12;this.D=12;this.mode='angle';}
  init(rooms,openings,widthFeet,aspectRatio,{suggested=false,north='top',recommendations=[],walls=[]}={}){
    this.dispose();
    const W=this.W=Math.max(3,Number(widthFeet||40)*.3048),D=this.D=Math.max(3,W*Math.max(.20,aspectRatio));
    const max=Math.max(W,D),status=new Map(recommendations.map(r=>[r.id,r.status]));
    const host=this.host;host.replaceChildren();
    const scene=this.scene=new THREE.Scene();
    // Transparent WebGL shows the soft multicolor CSS sky behind the 3D model.
    scene.background=null;
    const camera=this.camera=new THREE.PerspectiveCamera(44,host.clientWidth/Math.max(1,host.clientHeight),.10,280);
    const renderer=this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,window.innerWidth<780?1.35:1.7));
    renderer.setSize(host.clientWidth,Math.max(1,host.clientHeight));
    renderer.setClearColor(0x000000,0);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.07;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    host.append(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xfff9ed,0x6b9c8a,1.45));
    const sun=new THREE.DirectionalLight(0xffe9bf,1.95);sun.position.set(-W*.15,Math.max(16,max*1.65),D*.7);
    sun.castShadow=true;sun.shadow.mapSize.set(window.innerWidth<760?1024:2048,window.innerWidth<760?1024:2048);sun.shadow.camera.left=-max*1.6;sun.shadow.camera.right=max*1.6;sun.shadow.camera.top=max*1.6;sun.shadow.camera.bottom=-max*1.6;sun.shadow.bias=-.0005;scene.add(sun);
    const root=new THREE.Group();scene.add(root);
    landscape(root,W,D);
    // The soft ground and landscaping are decorative; observed walls come from image linework.
    const realWalls=Array.isArray(walls)&&walls.length>0;
    for(const [i,r] of rooms.entries()){
      if(!r.polygon?.length||r.polygon.length<3)continue;
      const poly=polygon(r,W,D);if(poly.length<3)continue;
      buildFloor(root,poly,r.type,suggested&&r.changed);
      // Do not turn approximate OCR room rectangles into fictitious structural walls.
      if(!realWalls)for(let j=0;j<poly.length;j++)makeWall(root,poly[j],poly[(j+1)%poly.length]);
      addFurniture(root,r.type,poly);
      const [x,z]=Array.isArray(r.label_anchor)&&r.label_anchor.length===2 ? [Number(r.label_anchor[0])*W,Number(r.label_anchor[1])*D] : centroid(poly);
      const tag=document.createElement('div');tag.className='room-tag'+(r.type==='unknown'?' muted-tag':'')+(suggested&&r.changed?' changed-tag':'')+(status.get(r.id)==='good'&&suggested?' good-tag':'')+(status.get(r.id)==='review'&&suggested?' review-tag':'');
      tag.textContent=displayName(r,i);host.append(tag);this.tags.push({tag,pos:new THREE.Vector3(x,WALL_HEIGHT+.38,z)});
    }
    if(realWalls){
      for(const segment of walls){
        if(!Array.isArray(segment)||segment.length!==2||segment.some(p=>!Array.isArray(p)||p.length!==2))continue;
        const [[x1,z1],[x2,z2]]=segment;
        const a=[Number(x1)*W,Number(z1)*D],b=[Number(x2)*W,Number(z2)*D];
        if(a.every(Number.isFinite)&&b.every(Number.isFinite))makeWall(root,a,b);
      }
    }
    const compass=document.createElement('div');compass.className='compass';compass.innerHTML=`<span>⌖</span> N ${({'top':'↑','right':'→','bottom':'↓','left':'←'})[north]||'↑'} · ${suggested?'Vastu':'Original'}`;host.append(compass);
    const controls=this.controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=Math.max(1.8,max*.25);controls.maxDistance=Math.max(40,max*6);controls.maxPolarAngle=Math.PI/2-.035;controls.target.set(W/2,0,D/2);
    this.setView('angle');
    const proj=new THREE.Vector3();
    const animate=()=>{
      this.frame=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);
      const width=host.clientWidth,height=host.clientHeight;
      for(const {tag,pos} of this.tags){proj.copy(pos).project(camera);
        const visible=proj.z>-1&&proj.z<1&&Math.abs(proj.x)<1.15&&Math.abs(proj.y)<1.15;
        tag.style.display=visible?'block':'none';
        if(visible){tag.style.left=`${((proj.x+1)/2)*width}px`;tag.style.top=`${((1-proj.y)/2)*height}px`;}
      }
    };animate();
    this.resizeObserver=new ResizeObserver(()=>{
      if(!this.renderer||!this.camera)return;
      const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);
      this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);
    });this.resizeObserver.observe(host);
  }
  setView(mode){
    if(!this.camera||!this.controls)return;
    const W=this.W,D=this.D,max=Math.max(W,D),aspect=this.host.clientWidth/Math.max(1,this.host.clientHeight);
    this.mode=mode;const distance=max*(aspect<1?1.85:1.30);
    this.controls.target.set(W/2,0,D/2);
    if(mode==='top')this.camera.position.set(W/2,distance*1.21,D/2+.01);
    else this.camera.position.set(W/2+distance*.54,distance*.74,D/2+distance*.62);
    this.camera.lookAt(W/2,0,D/2);this.controls.update();
  }
  png(){
    if(!this.renderer)return;
    this.renderer.render(this.scene,this.camera);
    const original=this.renderer.domElement;
    const c=document.createElement('canvas');c.width=original.width;c.height=original.height;
    const ctx=c.getContext('2d');
    // The WebGL canvas is transparent to reveal the live gradient; include that
    // background in exported PNGs, too, so saved files never look black.
    const bg=ctx.createLinearGradient(0,0,c.width,c.height);
    if(this.host.id==='vastuViewer') {bg.addColorStop(0,'#e8f3f9');bg.addColorStop(.5,'#f3eace');bg.addColorStop(1,'#c3e6d5');}
    else {bg.addColorStop(0,'#dbeefe');bg.addColorStop(.5,'#f3f1dc');bg.addColorStop(1,'#c8e2ce');}
    ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(original,0,0);
    // Include labels in the exported image (DOM badges aren't in WebGL itself).
    const sx=c.width/Math.max(1,this.host.clientWidth),sy=c.height/Math.max(1,this.host.clientHeight);
    ctx.font=`bold ${Math.round(12*sx)}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';
    for(const {tag} of this.tags){if(tag.style.display==='none')continue;
      const x=parseFloat(tag.style.left)*sx,y=parseFloat(tag.style.top)*sy,text=tag.textContent||'';
      const width=ctx.measureText(text).width+16*sx,height=24*sy;
      ctx.fillStyle='#ffffff';ctx.fillRect(x-width/2,y-height/2,width,height);
      ctx.fillStyle='#30363a';ctx.fillText(text,x,y);
    }
    const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='vastuaalay-3d-map.png';document.body.append(a);a.click();a.remove();
  }
  dispose(){
    if(this.frame)cancelAnimationFrame(this.frame);this.frame=null;
    this.resizeObserver?.disconnect();this.resizeObserver=null;
    this.controls?.dispose();this.controls=null;
    if(this.scene)this.scene.traverse(obj=>{obj.geometry?.dispose?.();const materials=Array.isArray(obj.material)?obj.material:[obj.material];for(const m of materials){if(m?.map)m.map.dispose();if(m && !Object.values(M).includes(m))m.dispose();}});
    if(this.renderer){this.renderer.dispose();this.renderer.domElement.remove();}
    for(const o of this.tags)o.tag.remove();this.tags=[];this.renderer=null;this.scene=null;this.camera=null;
  }
}
