// Traditional, simplified placement guidelines; not scientific or engineering rules.
export const roomNames={unknown:'Unidentified',living:'Hall / Living',bedroom:'Bedroom',kitchen:'Kitchen',bathroom:'Bathroom',puja:'Puja / Mandir',dining:'Dining',stairs:'Staircase',balcony:'Balcony',parking:'Parking',store:'Store',other:'Other'};
const ideals={living:['N','NE','E'],bedroom:['SW'],kitchen:['SE','NW'],bathroom:['NW','W'],puja:['NE'],dining:['E','W'],stairs:['S','SW','W'],balcony:['N','E','NE'],parking:['NW','N'],store:['SW','W']};
const compassHi={N:'उत्तर',NE:'ईशान (उत्तर-पूर्व)',E:'पूर्व',SE:'आग्नेय (दक्षिण-पूर्व)',S:'दक्षिण',SW:'नैऋत्य (दक्षिण-पश्चिम)',W:'पश्चिम',NW:'वायव्य (उत्तर-पश्चिम)',C:'मध्य'};
function centroid(points){let a=0,cx=0,cy=0;for(let i=0;i<points.length;i++){const [x,y]=points[i],[xx,yy]=points[(i+1)%points.length];const cr=x*yy-xx*y;a+=cr;cx+=(x+xx)*cr;cy+=(y+yy)*cr}if(Math.abs(a)<1e-9)return points.reduce((v,p)=>[v[0]+p[0]/points.length,v[1]+p[1]/points.length],[0,0]);return[cx/(3*a),cy/(3*a)]}
export function region(room,north){const [x,y]=centroid(room.polygon),u=x-.5,v=y-.5;let east=0,n=0;if(north==='top'){east=u;n=-v}else if(north==='right'){east=v;n=u}else if(north==='bottom'){east=-u;n=v}else{east=-v;n=-u}const xpart=east>.17?'E':east<-.17?'W':'';const ypart=n>.17?'N':n<-.17?'S':'';return ypart+xpart||'C'}
export function area(points){let a=0;for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length];a+=p[0]*q[1]-q[0]*p[1]}return Math.abs(a/2)}
function quality(type,zone){const picks=ideals[type];if(!picks)return 0;if(picks.includes(zone))return 3; if(zone==='C')return -.7;let best=-1.5;for(const v of picks){if(zone.includes(v)||v.includes(zone))best=Math.max(best,1.15);else if([...zone].some(x=>v.includes(x)))best=Math.max(best,0.6)}return best}
function normName(x){return roomNames[x]||roomNames.unknown}
export function zoneCenter(zone,north){let n=0,e=0;if(zone.includes('N'))n=.34;if(zone.includes('S'))n=-.34;if(zone.includes('E'))e=.34;if(zone.includes('W'))e=-.34;let x=.5,y=.5;if(north==='top'){x+=e;y-=n}else if(north==='right'){x+=n;y+=e}else if(north==='bottom'){x-=e;y+=n}else{x-=n;y-=e}return [x,y]}
function displacement(room,ideal,north){const [x,y]=centroid(room.polygon),[tx,ty]=zoneCenter(ideal,north);const ds=[];if(Math.abs(tx-x)>.12)ds.push(tx>x?'नक्शे के दाएँ':'नक्शे के बाएँ');if(Math.abs(ty-y)>.12)ds.push(ty>y?'नक्शे के नीचे':'नक्शे के ऊपर');return ds.join(' और ')||'उसी क्षेत्र के पास'}
export function analyze(rooms,north){return rooms.map(r=>{const zone=region(r,north),picks=ideals[r.type]||[];const known=!!picks.length;const good=known&&picks.includes(zone);const main=picks[0];return{id:r.id,name:r.name,type:r.type,current:zone,currentLabel:compassHi[zone],preferred:picks,preferredLabel:picks.map(d=>compassHi[d]).join(' / '),status:!known?'unknown':good?'good':'review',score:quality(r.type,zone),suggestion:!known?'कमरे की पहचान करें। इस कमरे के लिए निश्चित सामान्य नियम नहीं दिया गया है।':good?'यह कमरा पारंपरिक पसंदीदा दिशा में है। इसे बदले बिना रखा जा सकता है।':`${normName(r.type)} को सामान्य वास्तु मान्यता में ${compassHi[main]} क्षेत्र में रखने की सलाह दी जाती है। नक्शे में इसे ${displacement(r,main,north)} की ओर रखने पर विचार करें।`}})}
// Reassign *uses* between similarly sized existing spaces, never move/build walls.
// Keep proposed model honest: if no beneficial safe-size swap exists, simply annotate the room as needing review.
export function proposeAssignments(rooms,north){const uses=rooms.map(r=>({id:r.id,type:r.type,name:r.name}));const assigned=uses.map(u=>({...u}));const zones=rooms.map(r=>region(r,north));const areas=rooms.map(r=>area(r.polygon));let swaps=[];
for(let pass=0;pass<rooms.length;pass++){
 let best=null,bestGain=.85;
 for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){
  if(assigned[i].type==='unknown'||assigned[j].type==='unknown'||assigned[i].type===assigned[j].type)continue;
  if(!ideals[assigned[i].type]||!ideals[assigned[j].type])continue;
  const ratio=areas[i]/Math.max(areas[j],.00001);if(ratio<.70||ratio>1.43)continue;
  const now=quality(assigned[i].type,zones[i])+quality(assigned[j].type,zones[j]);
  const next=quality(assigned[j].type,zones[i])+quality(assigned[i].type,zones[j]);
  const gain=next-now;
  if(gain>bestGain){best={i,j};bestGain=gain}
 }
 if(!best)break;
 [assigned[best.i],assigned[best.j]]=[assigned[best.j],assigned[best.i]];
 swaps.push({from:rooms[best.i].name,to:rooms[best.j].name});
}
const result=rooms.map((r,i)=>({...r,originalName:r.name,originalType:r.type,type:assigned[i].type,name:assigned[i].name,changed:assigned[i].id!==r.id}));return{rooms:result,swaps};}
export const compassLabels=compassHi;
