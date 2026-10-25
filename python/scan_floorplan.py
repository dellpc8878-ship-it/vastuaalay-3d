#!/usr/bin/env python3
"""VASTUAALAY v6: extract printed labels AND measured wall linework independently.

Do not pass this preview off as a measured CAD/BIM reconstruction: room shapes inferred
from incomplete linework are approximate and included with detection metadata.
Usage: python scan_floorplan.py input.png [output.json] [preview.png]
"""
from __future__ import annotations
import json, sys, re, math, os
from pathlib import Path
import cv2
import numpy as np

# Render Free provides only a fraction of a CPU. Avoid repeated expensive OCR passes.
FAST_CLOUD_OCR = os.environ.get('VASTU_FAST_OCR', '1').lower() not in ('0','false','no')
ROOM_ALIASES={
 'bedroom':['bed room','bedroom','master bed','m bed','bed rm','शयन'],
 'kitchen':['kitchen','kltchen','kitohen','cook room','रसोई'],
 'living':['drawing room','drawing','living hall','living room','dining living hall','living','hall','lounge','बैठक'],
 'dining':['dining','dinning','भोजन'],
 'bathroom':['bathroom','bath room','bath','toilet','w c','wc','w.c','wash room','washroom','शौचालय'],
 'parking':['parking zone','parking','garage','पार्किंग'],
 'balcony':['open','balcony','terrace','verandah','veranda'],
 'stairs':['stairs','staircase','stair'],
 'puja':['puja','pooja','mandir','temple','पूजा'],
 'store':['store','storage','utility']
}

DISPLAY={
 'bedroom':'Bedroom','kitchen':'Kitchen','living':'Living / Drawing','dining':'Dining',
 'bathroom':'Bathroom','parking':'Parking','balcony':'Open Area','stairs':'Stairs',
 'puja':'Puja Room','store':'Store','unknown':'Unidentified Area'
}

def classify_label(text):
 t=re.sub(r'[^a-z0-9\u0900-\u097f]+',' ',str(text).lower()).strip()
 t=re.sub(r'\s+',' ',t)
 if not t:return None
 # Explicit printed words only, no inference from area shape or nearby room.
 for typ,words in ROOM_ALIASES.items():
  for term in words:
   term=re.sub(r'[^a-z0-9\u0900-\u097f]+',' ',term.lower()).strip()
   if re.search(r'(?<!\w)'+re.escape(term)+r'(?!\w)',t):return typ
 return None

def load_image(path):
 path=Path(path)
 if not path.exists():raise ValueError('Uploaded file does not exist')
 warn=[]
 if path.suffix.lower()=='.pdf':
  import fitz
  doc=fitz.open(str(path))
  if len(doc)<1:raise ValueError('Empty PDF')
  if len(doc)>1:warn.append('Only PDF page 1 analyzed')
  page=doc[0]
  # A large architectural PDF at 2.5x can exhaust a 512 MB cloud instance.
  longest=max(float(page.rect.width),float(page.rect.height),1)
  scale=min(2.5, (1700 if FAST_CLOUD_OCR else 2200)/longest)
  pix=page.get_pixmap(matrix=fitz.Matrix(scale,scale),alpha=False)
  im=cv2.cvtColor(np.frombuffer(pix.samples,dtype=np.uint8).reshape(pix.height,pix.width,3),cv2.COLOR_RGB2BGR)
  doc.close()
 else:
  if FAST_CLOUD_OCR:
   # Downscale while decoding where possible; don't materialize a huge OpenCV array.
   from PIL import Image, ImageOps
   with Image.open(str(path)) as source:
    if source.width * source.height > 50_000_000:
     raise ValueError('Image resolution is too large for free hosting; please upload a smaller PNG/JPG.')
    source=ImageOps.exif_transpose(source)
    source.thumbnail((1700,1700),Image.Resampling.BILINEAR)
    im=cv2.cvtColor(np.asarray(source.convert('RGB')),cv2.COLOR_RGB2BGR)
  else:
   im=cv2.imdecode(np.fromfile(str(path),dtype=np.uint8),cv2.IMREAD_COLOR)
 if im is None or min(im.shape[:2])<150:raise ValueError('Map image unreadable or too small')
 h,w=im.shape[:2]
 max_dim=1700 if FAST_CLOUD_OCR else 2200
 if max(h,w)>max_dim:
  s=max_dim/max(h,w);im=cv2.resize(im,(round(w*s),round(h*s)),interpolation=cv2.INTER_AREA)
 if min(im.shape[:2])<450:warn.append('Low-resolution image: small names and walls may be unclear.')
 return im,warn

def _setup_ocr():
 try:
  import pytesseract
  if sys.platform=='win32':
   import shutil
   if not shutil.which('tesseract'):
    for p in [r'C:\Program Files\Tesseract-OCR\tesseract.exe',r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe']:
     if Path(p).exists():pytesseract.pytesseract.tesseract_cmd=p;break
  langs=pytesseract.get_languages(config='')
  return pytesseract,'eng',None  # English labels first; mixed language often degrades English OCR
 except Exception as exc:return None,'eng',str(exc)[:140]

def _lines_from_ocr(data,factor,rotation,imgshape,psm):
 # Combine Tesseract tokens sharing a line, and also retain single-token labels.
 found=[];groups={}
 h,w=imgshape
 for i,word in enumerate(data['text']):
  word=str(word or '').strip()
  if not word or len(word)>50:continue
  try:conf=float(data['conf'][i])
  except (ValueError,TypeError):continue
  if conf<30:continue
  key=(data['block_num'][i],data['par_num'][i],data['line_num'][i])
  groups.setdefault(key,[]).append((word,int(data['left'][i]),int(data['top'][i]),int(data['width'][i]),int(data['height'][i]),conf))
 for line in groups.values():
  line.sort(key=lambda x:x[1]);chunks=[];chunk=[]
  for word in line:
   if chunk and word[1]-max(z[1]+z[3] for z in chunk)>max(22,3.2*max(z[4] for z in chunk)):
    chunks.append(chunk);chunk=[]
   chunk.append(word)
  if chunk:chunks.append(chunk)
  for chunk in chunks:
   matches=[]
   for start in range(len(chunk)):
    for n in range(1,min(5,len(chunk)-start)+1):
     ss=chunk[start:start+n];phrase=' '.join(t[0] for t in ss)
     typ=classify_label(phrase)
     if typ is None:continue
     normalized=re.sub('[^a-z]','',phrase.lower())
     if normalized in ('room','zone','hall') and len(chunk)>1:continue
     # Do not combine adjacent TOILET and OPEN (two distinct actual spaces).
     if n>1 and any(classify_label(t[0]) not in (None,typ) for t in ss):continue
     if n>1 and any(not re.search('[A-Za-z0-9\u0900-\u097f]',t[0]) for t in ss):continue
     score=sum(z[5] for z in ss)/len(ss)+min(15,n*3)
     matches.append((score,start,n,ss,typ,phrase))
   used=set()
   for score,start,n,ss,typ,text in sorted(matches,key=lambda m:(-m[0],-m[2])):
    if any(j in used for j in range(start,start+n)):continue
    x0=min(z[1] for z in ss);y0=min(z[2] for z in ss)
    x1=max(z[1]+z[3] for z in ss);y1=max(z[2]+z[4] for z in ss)
    cx=(x0+x1)/(factor*2);cy=(y0+y1)/(factor*2)
    if rotation==1:cx,cy=cy,h-cx
    elif rotation==2:cx,cy=w-cy,cx
    if not (5<cx<w-5 and 5<cy<h-5):continue
    if (x1-x0)/factor<2 or (y1-y0)/factor<2:continue
    found.append({'x':round(cx,2),'y':round(cy,2),'type':typ,'text':text,'score':score,'psm':psm})
    used.update(range(start,start+n))
 return found

def ocr_map(img):
 pyt,lang,warning=_setup_ocr()
 if not pyt:return [],warning,''
 h,w=img.shape[:2];scale=max(1,min(3.2,760/min(h,w)))
 # Only upscale when source is small, preserving original coordinates in output.
 enlarged=cv2.resize(img,None,fx=scale,fy=scale,interpolation=cv2.INTER_CUBIC) if scale!=1 else img
 gray=cv2.cvtColor(enlarged,cv2.COLOR_BGR2GRAY)
 candidates=[];raw=[]
 for psm in ((3,11,6) if FAST_CLOUD_OCR else (3,11,6,12)):
  try:
   d=pyt.image_to_data(gray,lang=lang,config=f'--psm {psm}',output_type=pyt.Output.DICT,timeout=12 if FAST_CLOUD_OCR else 18)
  except Exception as e:warning=str(e)[:130];continue
  candidates.extend(_lines_from_ocr(d,scale,0,(h,w),psm))
  raw.extend(str(t) for t in d['text'] if str(t).strip())
 # Rotate original to recognize vertically written PARKING, STAIR, dimensions.
 for code,rotation in ([(cv2.ROTATE_90_CLOCKWISE,1)] if FAST_CLOUD_OCR else [(cv2.ROTATE_90_CLOCKWISE,1),(cv2.ROTATE_90_COUNTERCLOCKWISE,2)]):
  try:
   rot=cv2.rotate(gray,code)
   d=pyt.image_to_data(rot,lang=lang,config='--psm 11',output_type=pyt.Output.DICT,timeout=12 if FAST_CLOUD_OCR else 15)
   candidates.extend(_lines_from_ocr(d,scale,rotation,(h,w),11))
  except Exception:pass
 # NMS using label text/type and spatial proximity; only one label at each location.
 candidates.sort(key=lambda c:c['score'],reverse=True)
 kept=[]
 for c in candidates:
  if any(math.hypot(c['x']-k['x'],c['y']-k['y'])<max(22,0.07*min(h,w)) for k in kept):continue
  kept.append(c)
 return sorted(kept,key=lambda c:(c['y'],c['x'])),warning,' '.join(raw)[:270]

def _merge_axis(lines,gap=10,coord_tol=7):
 # Convert [fixed,start,end] line strokes into clean centerlines, avoiding 8 duplicate walls
 # from each thick printed boundary.
 ls=sorted((float(c),float(min(a,b)),float(max(a,b))) for c,a,b in lines)
 groups=[]
 for c,a,b in ls:
  if b-a<12:continue
  group=min((g for g in groups if abs(c-g['center'])<=coord_tol),key=lambda x:abs(c-x['center']),default=None)
  if group is None:
   group={'center':c,'coords':[c],'segs':[]};groups.append(group)
  else:
   group['coords'].append(c);group['center']=float(np.median(group['coords']))
  group['segs'].append((a,b))
 out=[]
 for g in groups:
  ranges=sorted(g['segs']);a,b=ranges[0]
  for sa,sb in ranges[1:]:
   if sa<=b+gap:b=max(b,sb)
   else:
    out.append((round(g['center'],2),round(a,2),round(b,2)));a,b=sa,sb
  out.append((round(g['center'],2),round(a,2),round(b,2)))
 return out

def detect_wall_segments(img):
 h,w=img.shape[:2]
 gray=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY)
 # Saturation/color-agnostic: gold openings should not become a solid wall.
 dark=(gray<150).astype(np.uint8)*255
 # Remove page printing (isolated letters) and short stair treads; retain major lines.
 l=max(14,int(.049*min(w,h)))
 hk=cv2.getStructuringElement(cv2.MORPH_RECT,(l,1))
 vk=cv2.getStructuringElement(cv2.MORPH_RECT,(1,l))
 horizontal=cv2.morphologyEx(dark,cv2.MORPH_OPEN,hk)
 vertical=cv2.morphologyEx(dark,cv2.MORPH_OPEN,vk)
 # Hough line extraction from morph masks gives geometry independent of OCR labels.
 hs=[];vs=[]
 for mask,vertical_mode in [(horizontal,False),(vertical,True)]:
  arr=cv2.HoughLinesP(mask,1,np.pi/180,threshold=max(16,l//2),minLineLength=l,maxLineGap=max(3,l//8))
  if arr is None:continue
  for x0,y0,x1,y1 in arr[:,0]:
   if vertical_mode and abs(x1-x0)<=max(3,.009*w) and abs(y1-y0)>=l:vs.append(((x0+x1)/2,y0,y1))
   elif not vertical_mode and abs(y1-y0)<=max(3,.009*h) and abs(x1-x0)>=l:hs.append(((y0+y1)/2,x0,x1))
 hs=_merge_axis(hs,gap=max(5,int(.014*w)),coord_tol=max(3,int(.007*h)))
 vs=_merge_axis(vs,gap=max(5,int(.014*h)),coord_tol=max(3,int(.007*w)))
 # Ignore title line and text below the plan: use long verticals/upper outline as source of bounds.
 return hs,vs

def plan_frame(hs,vs,imgshape):
 h,w=imgshape
 long_v=[(x,a,b) for x,a,b in vs if b-a>.36*h and a<.32*h]
 long_h=[(y,a,b) for y,a,b in hs if b-a>.42*w]
 if len(long_v)>=2:
  lx=min(x for x,a,b in long_v);rx=max(x for x,a,b in long_v)
 else:lx=.045*w;rx=.955*w
 if long_h:
  tops=[y for y,a,b in long_h if y<.20*h]
  bottoms=[y for y,a,b in long_h if .50*h<y<.925*h and a<rx and b>lx]
  ty=min(tops) if tops else .035*h
  by=max(bottoms) if bottoms else .91*h
 else:ty=.035*h;by=.91*h
 # Reasonable guards prevent badly detected title-underlines from defining the house.
 if rx-lx<.45*w or by-ty<.45*h:return (0,0,w,h)
 return (max(0,lx),max(0,ty),min(w,rx),min(h,by))

def _usable_lines(hs,vs,bounds):
 lx,ty,rx,by=bounds
 hs=[(y,max(a,lx),min(b,rx)) for y,a,b in hs if ty-10<=y<=by+10 and b>lx and a<rx]
 vs=[(x,max(a,ty),min(b,by)) for x,a,b in vs if lx-10<=x<=rx+10 and b>ty and a<by]
 return hs,vs

def room_rect(label,hs,vs,bounds,all_labels):
 """Approximate an OCR-labeled room footprint from observed orthogonal walls.

    This is deliberately not represented as an exact traced polygon. Open spaces
    without all four wall boundaries are divided at nearby *observed* plan edges.
 """
 x,y=label['x'],label['y'];lx,ty,rx,by=bounds;pw=rx-lx;ph=by-ty
 # Boundary must cross the label row/column or reach within small distance.
 def distance_to_range(v,a,b):return max(a-v,0,v-b)
 # Prefer nearer lines that actually span seed row/column. Allow *modest* gap
 # to capture door openings, but avoid borrowing remote walls across rooms.
 v_candidates=[]
 for vx,a,b in vs:
  dy=distance_to_range(y,a,b)
  if dy<.038*ph:v_candidates.append((vx,dy))
 h_candidates=[]
 for vy,a,b in hs:
  dx=distance_to_range(x,a,b)
  if dx<.045*pw:h_candidates.append((vy,dx))
 def bound(candidates,center,direction,edge,minsep):
  choices=[(abs(pos-center)+penalty*.8,pos) for pos,penalty in candidates if (pos-center)*direction>minsep]
  return min(choices)[1] if choices else edge
 left=bound(v_candidates,x,-1,lx,.025*pw)
 right=bound(v_candidates,x,+1,rx,.025*pw)
 top=bound(h_candidates,y,-1,ty,.025*ph)
 bottom=bound(h_candidates,y,+1,by,.025*ph)
 # If missing walls, use midpoints between neighboring actual recognized names.
 neighbors=[other for other in all_labels if other is not label]
 for q in neighbors:
  xx,yy=q['x'],q['y']
  if abs(yy-y)<.22*ph:
   midpoint=(x+xx)/2
   if xx<x and left<midpoint and x-left>.30*pw and q['type']!='parking':left=midpoint
   if xx>x and right>midpoint and right-x>.30*pw:right=midpoint
  if abs(xx-x)<.25*pw:
   midpoint=(y+yy)/2
   if yy<y and top<midpoint and y-top>.31*ph:top=midpoint
   if yy>y and bottom>midpoint and bottom-y>.31*ph:bottom=midpoint
 # Reject implausibly small label rooms; avoid spurious W.C-size box from word fragments.
 if right-left<.052*pw:
  left=max(lx,x-.045*pw);right=min(rx,x+.045*pw)
 if bottom-top<.046*ph:
  top=max(ty,y-.042*ph);bottom=min(by,y+.042*ph)
 # The output is a *preview* rectangle; walls are rendered from actual wall_segments.
 return [[float(left),float(top)],[float(right),float(top)],
         [float(right),float(bottom)],[float(left),float(bottom)]]

def _rel_pt(x,y,bounds):
 x0,y0,x1,y1=bounds
 return [round(float(np.clip((x-x0)/max(1,x1-x0),0,1)),5),round(float(np.clip((y-y0)/max(1,y1-y0),0,1)),5)]

def _enclosed_small_labels(img,bounds,existing):
 """Second OCR pass inside *enclosed* compact compartments. This catches W.C.
 and BATH printed beside heavy boundary lines, without inventing labels.
 """
 pyt,lang,warning=_setup_ocr()
 if pyt is None:return []
 h,w=img.shape[:2]
 gray=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY)
 bw=cv2.adaptiveThreshold(gray,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY_INV,31,10)
 ln=max(12,round(min(w,h)/65))
 wall=cv2.bitwise_or(cv2.morphologyEx(bw,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_RECT,(ln,1))),
  cv2.morphologyEx(bw,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_RECT,(1,ln))))
 wall=cv2.morphologyEx(wall,cv2.MORPH_CLOSE,np.ones((7,7),np.uint8))
 wall=cv2.dilate(wall,np.ones((3,3),np.uint8),iterations=1)
 n,lbl,st,cent=cv2.connectedComponentsWithStats(255-wall,8)
 regions=[]
 for i in range(1,n):
  x,y,rw,rh,area=[int(t) for t in st[i]]
  if area<.0025*w*h or area>.07*w*h or min(rw,rh)<22:continue
  cx=x+rw/2;cy=y+rh/2
  if x<bounds[0]+3 or y<bounds[1]+3 or x+rw>bounds[2]-3 or y+rh>bounds[3]-3:continue
  if any(math.hypot(cx-o['x'],cy-o['y'])<.4*max(rw,rh) for o in existing):continue
  regions.append((rw*rh,x,y,rw,rh))
 regions=sorted(regions,reverse=True)[:5 if FAST_CLOUD_OCR else 18]
 output=[]
 for _,x,y,rw,rh in regions:
  inset=max(2,min(9,int(min(rw,rh)*.035)))
  crop=img[y+inset:y+rh-inset,x+inset:x+rw-inset]
  if crop.size==0:continue
  factor=min(3.3,max(1.2,440/max(crop.shape[:2])))
  resize=cv2.resize(crop,None,fx=factor,fy=factor,interpolation=cv2.INTER_CUBIC)
  g=cv2.cvtColor(resize,cv2.COLOR_BGR2GRAY)
  snippets=[]
  for mode in ((11,) if FAST_CLOUD_OCR else (6,11)):
   try:
    d=pyt.image_to_data(g,config=f'--psm {mode}',lang=lang,output_type=pyt.Output.DICT,timeout=7 if FAST_CLOUD_OCR else 5)
   except Exception:continue
   cands=_lines_from_ocr(d,factor,0,crop.shape[:2],mode)
   snippets.extend(cands)
  if snippets:
   item=max(snippets,key=lambda v:v['score'])
   xx=x+inset+item['x'];yy=y+inset+item['y']
   if any(math.hypot(xx-o['x'],yy-o['y'])<max(18,.06*min(w,h)) for o in existing+output):continue
   output.append({'x':xx,'y':yy,'type':item['type'],'text':item['text'],'score':item['score'],'psm':item['psm'],'origin':'room_crop_ocr'})
 return output

def _make_rooms(labels,hs,vs,bounds):
 lx,ty,rx,by=bounds
 labels=[x for x in labels if lx-.02*(rx-lx)<=x['x']<=rx+.02*(rx-lx) and ty<=x['y']<=by]
 # Multiword OCR can label 'BED' 'ROOM' separately. If 2 synonyms physically nearby,
 # preserve unique locations rather than duplicating rooms.
 rooms=[]
 for lab in labels:
  poly=room_rect(lab,hs,vs,bounds,labels)
  cx,cy=lab['x'],lab['y']
  # A label that falls between detected rooms still earns a *clearly marked approximate* area.
  name=lab['text'].strip().replace('  ',' ')
  if lab['type']=='bathroom':
   normalized=re.sub('[^a-z0-9]','',name.lower())
   if normalized in ('wc','wc1'):name='W.C.'
   elif 'toilet' in normalized:name='Toilet'
   elif 'bath' in normalized:name='Bath'
   else:name='Bathroom'
  elif lab['type']=='bedroom':name='Bedroom'
  elif lab['type']=='kitchen':name='Kitchen'
  elif lab['type']=='living':name='Drawing Room' if 'drawing' in name.lower() else 'Living / Hall'
  elif lab['type']=='dining':name='Dining'
  elif lab['type']=='parking':name='Parking Zone'
  elif lab['type']=='balcony':name='Open Area'
  elif lab['type']=='stairs':name='Stairs'
  rooms.append({'id':f'r{len(rooms)+1}','type':lab['type'],'name':name,
       'polygon':[_rel_pt(x,y,bounds) for x,y in poly],
       'label_anchor':_rel_pt(cx,cy,bounds),'origin':'printed_ocr',
       'geometry':'approximate_from_lines','confirmed':False,'confidence':'recognized_label_estimated_boundaries'})
 return rooms

def _fallback_regions(img,bounds,labels):
 # If OCR fails entirely, do not fabricate room uses. Keep candidate_rooms from v4 only
 # as a visually neutral last resort in the known plan area.
 gray=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY)
 bw=cv2.adaptiveThreshold(gray,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY_INV,31,10)
 h,w=bw.shape
 l=max(12,min(w,h)//65)
 wall=cv2.bitwise_or(cv2.morphologyEx(bw,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_RECT,(l,1))),cv2.morphologyEx(bw,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_RECT,(1,l))))
 wall=cv2.morphologyEx(wall,cv2.MORPH_CLOSE,np.ones((max(5,l//3),max(5,l//3)),np.uint8))
 n,cc,stats,cent=cv2.connectedComponentsWithStats(255-wall,8)
 out=[]
 for i in range(1,n):
  x,y,ww,hh,area=stats[i]
  if area<.006*w*h or area>.36*w*h or x<4 or y<4 or x+ww>w-4 or y+hh>h-4:continue
  corners=[(x,y),(x+ww,y),(x+ww,y+hh),(x,y+hh)]
  if not all(bounds[0]<=cx<=bounds[2] and bounds[1]<=cy<=bounds[3] for cx,cy in corners):continue
  out.append({'id':f'r{len(out)+1}','name':f'Unidentified Area {len(out)+1}',
   'type':'unknown','polygon':[_rel_pt(cx,cy,bounds) for cx,cy in corners],
   'origin':'unidentified_wall_region','geometry':'approximate','confirmed':False})
 return out[:14]

def scan(path,preview=None):
 im,warn=load_image(path)
 if preview:cv2.imwrite(str(preview),im)
 h,w=im.shape[:2]
 labels,ocr_warning,ocr_text=ocr_map(im)
 labels.extend(_enclosed_small_labels(im,(0,0,w,h),labels))
 hs,vs=detect_wall_segments(im)
 bounds=plan_frame(hs,vs,(h,w))
 hs,vs=_usable_lines(hs,vs,bounds)
 rooms=_make_rooms(labels,hs,vs,bounds)
 if not rooms:rooms=_fallback_regions(im,bounds,labels)
 # Recognized labels should not be overwritten by fallback 'area' counts.
 walls=[];minLen=max(18,.028*min(w,h))
 for y,a,b in hs:
  if b-a>=minLen:walls.append([_rel_pt(a,y,bounds),_rel_pt(b,y,bounds)])
 for x,a,b in vs:
  if b-a>=minLen:walls.append([_rel_pt(x,a,bounds),_rel_pt(x,b,bounds)])
 note=['Architecture is a visual approximation from detected plan lines; verify walls and room sizes against the original drawing.',
 'Furniture, landscaping and lighting in 3D are illustrative, not present in the uploaded 2D map.',
 'North arrow and exact dimensions are not reliably inferred; Vastu locations require a confirmed compass direction.']
 note.extend(warn)
 if ocr_warning:note.append('OCR: '+ocr_warning)
 if len(rooms)<2:note.append('Few names read. Try a higher-resolution PNG/PDF with clear printed room labels.')
 return {'ok':True,'source':'opencv_wall_ocr_v6','image':{'width':w,'height':h},
  'plan_bounds':[_rel_pt(bounds[0],bounds[1],(0,0,w,h)),_rel_pt(bounds[2],bounds[3],(0,0,w,h))],
  'rooms':rooms,'walls':walls,'openings':[],
  'analysis':{'detected_regions':len(rooms),'ocr_matched_rooms':sum(r['type']!='unknown' for r in rooms),
   'ocr_label_candidates':len(labels),'wall_segments':len(walls),'ocr_text_excerpt':ocr_text[:220],
   'ocr_engine_detail':ocr_warning or 'Tesseract accessible','plan_frame_px':[round(v) for v in bounds],
   'width_estimate_feet':None,'geometry_accuracy':'approximate'},'warnings':note}

def main():
 if len(sys.argv)<2:
  print(json.dumps({'ok':False,'error':'Pass a JPG/PNG/PDF input path'},ensure_ascii=True));return 2
 try:result=scan(sys.argv[1],sys.argv[3] if len(sys.argv)>3 else None)
 except Exception as e:result={'ok':False,'error':str(e)}
 payload=json.dumps(result,ensure_ascii=True)
 if len(sys.argv)>2 and sys.argv[2]:Path(sys.argv[2]).write_text(payload,encoding='utf-8')
 print(payload)
 return 0 if result['ok'] else 1

if __name__=='__main__':sys.exit(main())
