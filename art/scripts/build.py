#!/usr/bin/env python3
"""Rebuild the PNG art from retained generated sources and authoritative masks.

Requires Pillow, NumPy and SciPy. Nothing outside art/ is read or written.
"""
from pathlib import Path
import json
import math
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy.ndimage import gaussian_filter, distance_transform_edt, binary_erosion, label

ROOT = Path(__file__).resolve().parents[1]
W, H = 2560, 1440
RESAMPLE = Image.Resampling.LANCZOS
PALETTE = np.array([(0,0,0), (128,128,128), (200,160,96), (160,224,255),
                    (255,0,0), (255,255,255), (255,255,0)], dtype=np.int32)
INK = (20, 25, 25, 255)
CAR_NAMES = ['player', 'steady', 'balanced', 'hotshot', 'reckless']
COLORS = [(255,210,61), (54,194,122), (61,140,240), (176,93,224), (232,70,60)]


def png(a):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def load_mask(n):
    a = np.asarray(Image.open(ROOT / f'reference/track-{n}-mask.png').convert('RGB')).astype(np.int32)
    distances = [np.sum((a - c) ** 2, axis=2) for c in PALETTE]
    return np.argmin(np.stack(distances), axis=0).astype(np.uint8)


def repeat(tile, w=W, h=H):
    a = np.array(tile.convert('RGB'))
    return png(np.tile(a, (math.ceil(h/a.shape[0]), math.ceil(w/a.shape[1]), 1))[:h, :w])


def periodic_source(im, size=512):
    """Cosine mix half-period shifts; outside edges are mathematically continuous."""
    a = np.asarray(im.convert('RGB').resize((size,size), RESAMPLE)).astype(np.float32)
    t = (1 - np.cos(np.arange(size) * 2*np.pi / size)) / 2
    a = a*t[None,:,None] + np.roll(a,size//2,axis=1)*(1-t[None,:,None])
    a = a*t[:,None,None] + np.roll(a,size//2,axis=0)*(1-t[:,None,None])
    # Equalize the endpoint pixel samples, without any blurred perimeter strip.
    a[:,0] = a[:,-1] = (a[:,0]+a[:,-1])/2
    a[0] = a[-1] = (a[0]+a[-1])/2
    return a


def ground(n):
    """Periodic, low-contrast ground with generated ink/grain and wrapped flecks."""
    rng = np.random.default_rng(812+n)
    source = periodic_source(Image.open(ROOT / 'sources/gravel.png'))
    grain = source.mean(axis=2)
    grain = (grain-grain.mean()) / grain.std()
    mottling = gaussian_filter(rng.normal(size=(512,512)), 24, mode='wrap')
    mottling /= mottling.std()
    base = np.array([(66,85,48), (113,104,68), (224,232,226), (124,101,75)][n])
    amp = [5,7,3,6][n]
    a = base + (grain*amp + mottling*3)[...,None]
    tile = png(a)
    d = ImageDraw.Draw(tile)
    rand = random.Random(812+n)
    for i in range(1700):
        x,y = rand.randrange(512),rand.randrange(512)
        dx,dy = rand.choice([(3,-2),(2,1),(1,1),(5,-3)])
        color = tuple((base + rand.choice([-15,-9,9,16])).clip(0,255).astype(int))
        for ox in [-512,0,512]:
            for oy in [-512,0,512]:
                if n == 2:
                    d.line((x+ox,y+oy,x+ox+dx,y+oy+dy),fill=color,width=1)
                else:
                    d.line((x+ox,y+oy,x+ox+dx,y+oy+dy),fill=color,width=1)
    a = np.array(tile)
    a[:,0]=a[:,-1]=((a[:,0].astype(int)+a[:,-1])/2).astype(np.uint8)
    a[0]=a[-1]=((a[0].astype(int)+a[-1])/2).astype(np.uint8)
    return png(a)


def geometry(n):
    return json.loads((ROOT / f'reference/track-{n}-geometry.json').read_text())


def offset_path(samples, offset=0):
    result=[]
    for p in samples:
        normal=(np.array(p['left'])-np.array(p['right'])) / p['width']
        result.append(tuple(np.array([p['x'],p['y']])+normal*offset))
    return result


def texture(name):
    im=Image.open(ROOT / f'sources/{name}.png')
    a=periodic_source(im,512)
    if name == 'asphalt':
        grey=a.mean(axis=2)
        grey=(grey-grey.mean())*.28+64
        a=np.stack((grey*.91,grey*.98,grey*1.06),axis=2)
    elif name == 'gravel':
        a = a*.65 + np.array([181,145,87])*.35
    else:
        a = a*.60 + np.array([201,230,236])*.40
    return repeat(png(a))


def tyre(d,x,y,r=9):
    d.ellipse((x-r+3,y-r+4,x+r+5,y+r+6),fill=(24,26,22,80))
    d.ellipse((x-r,y-r,x+r,y+r),fill=(19,23,22,255),outline=(6,8,8,255),width=2)
    d.arc((x-r+2,y-r+2,x+r-2,y+r-2),190,340,fill=(89,92,81,255),width=2)
    d.ellipse((x-r*.37,y-r*.37,x+r*.37,y+r*.37),fill=(8,10,10,255))


def rock(d,x,y,r,rng,n):
    points=[(x+math.cos(i*math.pi/3)*r*rng.uniform(.65,1.1),y+math.sin(i*math.pi/3)*r*rng.uniform(.65,1.1)) for i in range(6)]
    fill=(164,160,138,255) if n!=2 else (164,182,186,255)
    d.polygon(points,fill=fill,outline=INK,width=2)
    d.line([points[0],(x-2,y+2),points[3]],fill=INK,width=2)
    for t in range(4):
        d.line((x-r*.6+t*3,y,x-r*.2+t*3,y+r*.4),fill=(72,75,69,255),width=1)


def pine(d,x,y,r,rng):
    points=[]
    for i in range(24):
        angle=i*math.pi/12
        length=r*(.48 if i%2 else rng.uniform(.8,1.12))
        points.append((x+math.cos(angle)*length,y+math.sin(angle)*length))
    d.polygon(points,fill=(30,62,61,255),outline=(16,35,38,255),width=3)
    for i in range(0,24,2):
        px,py=points[i]
        d.line((x,y,px,py),fill=(165,190,187,255),width=3)
    d.ellipse((x-5,y-5,x+5,y+5),fill=(229,237,229,255))


def props(n,road,geo):
    out=Image.new('RGBA',(W,H));d=ImageDraw.Draw(out);rng=random.Random(71+n)
    distance=distance_transform_edt(~road)
    # Scattered objects are wholly off road, with clearance around each silhouette.
    for _ in range(180):
        x,y=rng.randrange(140,W-140),rng.randrange(100,H-100)
        r=rng.randrange(10,24)
        if not (r+20 < distance[y,x] < 125):
            continue
        if n==0:
            if rng.random()<.6:
                for i in range(4):tyre(d,x+i*14,y,8)
            else:rock(d,x,y,r,rng,n)
        elif n==1:
            if rng.random()<.45:
                d.rounded_rectangle((x-r,y-8,x+r,y+8),3,fill=(199,162,76,255),outline=INK,width=2)
                d.line((x-5,y-8,x-5,y+8),fill=INK,width=2)
                d.line((x+6,y-8,x+6,y+8),fill=INK,width=2)
                for k in range(9):d.line((x-r+3+k*4,y-5,x-r+6+k*4,y+5),fill=(113,91,39,255),width=1)
            else:rock(d,x,y,r,rng,n)
        elif n==2:
            if rng.random()<.7:pine(d,x,y,r,rng)
            else:
                for i in range(7):
                    dx=rng.randrange(-r,r)
                    d.line((x+dx,y+10,x+dx-5,y-12),fill=(98,109,86,255),width=2)
        else:
            if rng.random()<.65:
                for i in range(3):tyre(d,x+i*16,y,9)
            else:
                d.rectangle((x-r,y-7,x+r,y+7),fill=(153,154,137,255),outline=INK,width=2)
                d.line((x-r+2,y-4,x+r-3,y-4),fill=(211,207,184,255),width=2)
    # Extra walls follow the kerb with enough space to avoid narrowing the course.
    if n in [0,3]:
        samples=geo['samples']
        for i in range(0,len(samples),18):
            p=samples[i]
            if i%91>66:continue
            normal=(np.array(p['left'])-np.array(p['right']))/p['width']
            pos=np.array(p['left'])+normal*33
            x,y=map(int,pos)
            if 80<x<W-80 and 80<y<H-80 and distance[y,x]>22:
                tyre(d,x,y,7)
    # A snow drift follows the outside of the kerb, with transparent gaps.
    if n==2:
        for side in ['left','right']:
            for i,p in enumerate(geo['samples'][::7]):
                if i%7 in [0,1]:continue
                normal=(np.array(p[side])-np.array([p['x'],p['y']]))
                normal/=np.linalg.norm(normal)
                x,y=np.array(p[side])+normal*24
                if 90<x<W-90 and 90<y<H-90:
                    d.ellipse((x-13,y-8,x+13,y+8),fill=(242,246,235,255),outline=(135,161,165,255),width=1)
    a=np.array(out)
    a[distance<12,3]=0
    return png(a)


def scene(n,road):
    im=Image.open(ROOT/f'sources/scene-{n}.png').convert('RGBA')
    a=np.array(im)
    # Generated soft shadow haze is discarded; retain the inked asset cluster.
    alpha=a[...,3].astype(float)/255
    a[...,3]=np.clip((alpha-.10)/.75,0,1)*255
    im=png(a)
    if n==0:
        # Spread long structures through the circuit's narrow infield strips.
        layer=Image.new('RGBA',(W,H))
        for crop,size,pos in [
            ((130,60,1080,400),(420,150),(850,300)),
            ((100,415,1110,675),(505,130),(1660,278)),
            ((86,670,1110,872),(620,122),(1380,702)),
            ((1170,410,1460,925),(110,195),(2245,670)),
        ]:
            part=im.crop(crop).resize(size,RESAMPLE)
            pa=np.array(part)
            yy,xx=np.indices((part.height,part.width))
            margin=np.minimum.reduce([xx,yy,part.width-1-xx,part.height-1-yy])
            pa[...,3]=(pa[...,3]*np.clip(margin/5,0,1)).astype(np.uint8)
            # The garage forecourt blends softly into the surrounding grass.
            if crop[1]==60:
                pa[...,3]=(pa[...,3]*np.clip((part.height-1-yy)/24,0,1)).astype(np.uint8)
            part=png(pa)
            layer.alpha_composite(part,pos)
        a=np.array(layer);distance=distance_transform_edt(~road)
        if np.any((a[...,3]>128)&(distance<12)):
            raise ValueError('circuit scenery crosses road clearance')
        a[distance<12,3]=0
        return png(a)
    if n==3:
        # Stands and lights flank the track; equipment sits further infield.
        layer=Image.new('RGBA',(W,H))
        for crop,size,pos in [
            ((235,110,1300,390),(915,240),(1020,250)),
            ((235,110,1300,390),(840,220),(1020,999)),
            ((860,430,1270,700),(285,188),(1500,680)),
            ((330,470,680,650),(225,116),(1180,735)),
            ((20,10,260,335),(110,150),(800,287)),
            ((1270,5,1536,325),(120,145),(2050,340)),
        ]:
            part=im.crop(crop).resize(size,RESAMPLE)
            pa=np.array(part);yy,xx=np.indices((part.height,part.width))
            margin=np.minimum.reduce([xx,yy,part.width-1-xx,part.height-1-yy])
            pa[...,3]=(pa[...,3]*np.clip(margin/18,0,1)).astype(np.uint8)
            layer.alpha_composite(png(pa),pos)
        a=np.array(layer);distance=distance_transform_edt(~road)
        if np.any((a[...,3]>128)&(distance<12)):
            raise ValueError('stadium scenery crosses road clearance')
        a[distance<12,3]=0
        return png(a)
    bbox=im.getchannel('A').point(lambda p:255 if p>60 else 0).getbbox()
    im=im.crop(bbox)
    # Chosen rectangles sit in the large safe infield of each immutable circuit.
    boxes=[(1090,689,980,195), (1770,710,610,475), (630,500,1130,530), (935,432,1180,575)]
    x,y,w,h=boxes[n]
    scale=min(w/im.width,h/im.height)
    im=im.resize((round(im.width*scale),round(im.height*scale)),RESAMPLE)
    # Circuit infield is narrow: separate the long pit and spectator strip.
    layer=Image.new('RGBA',(W,H))
    layer.alpha_composite(im,(x,y))
    a=np.array(layer);distance=distance_transform_edt(~road)
    actual=a[...,3]>128
    if np.any(actual & (distance<12)):
        raise ValueError(f'scene {n} crosses road clearance; choose a safe placement')
    a[distance<12,3]=0
    return png(a)


def road_details(n,mask,geo):
    out=Image.new('RGBA',(W,H));d=ImageDraw.Draw(out);samples=geo['samples']
    rng=random.Random(325+n)
    # Faded dashes sit at the exact center samples, with surface-specific colors.
    colors={'asphalt':(163,157,136,100),'gravel':(224,198,142,85),'ice':(245,250,243,120)}
    for i in range(0,len(samples)-4,12):
        d.line(offset_path(samples[i:i+4]),fill=colors[samples[i]['surface']],width=3)
    # Tyre scuffs follow the driving curve instead of random road-crossing marks.
    for k in range(22):
        i=rng.randrange(len(samples)-38)
        ss=samples[i:i+rng.randrange(13,38)]
        surf=ss[0]['surface'];offset=rng.randrange(-40,40)
        if surf=='ice':color=(87,148,171,60)
        elif surf=='gravel':color=(78,60,34,62)
        else:color=(9,13,18,110)
        for delta in [-13,13]:
            d.line(offset_path(ss,offset+delta),fill=color,width=3 if surf=='ice' else 5)
            if surf=='gravel':d.line(offset_path(ss,offset+delta+4),fill=(230,199,141,62),width=2)
    # Flat patches and branching fractures are sparse and far from the edge.
    for k in range(40):
        p=rng.choice(samples);x,y=p['x'],p['y'];surf=p['surface']
        if surf=='asphalt' and k%3==0:
            rw,rh=rng.randrange(15,43),rng.randrange(10,24)
            d.polygon([(x-rw,y-rh),(x+rw,y-rh+4),(x+rw-5,y+rh),(x-rw+3,y+rh)],fill=(91,96,101,75),outline=(22,27,32,130),width=2)
            for j in range(3):d.line((x-rw+4+j*7,y+rh-2,x-rw+9+j*7,y+rh-9),fill=(14,20,25,80),width=1)
        elif surf in ['asphalt','ice']:
            pts=[(x,y)]
            for j in range(5):x+=rng.randrange(-9,16);y+=rng.randrange(-8,14);pts.append((x,y))
            col=(15,22,29,150) if surf=='asphalt' else (49,116,145,135)
            d.line(pts,fill=col,width=2)
            d.line([pts[2],(pts[2][0]-17,pts[2][1]+4)],fill=col,width=1)
    # Ramp shadow sits immediately behind each authoritative yellow ramp band.
    for index in geo['jumpRampSamples']:
        p=samples[index];q=samples[(index+2)%len(samples)]
        tangent=np.array([q['x']-p['x'],q['y']-p['y']]);tangent/=np.linalg.norm(tangent)
        for j in range(8,24):
            a=np.array(p['left'])-tangent*j;b=np.array(p['right'])-tangent*j
            d.line([tuple(a),tuple(b)],fill=(9,13,17,int(120*(24-j)/16)),width=2)
    a=np.array(out)
    a[~np.isin(mask,[1,2,3]),3]=0
    return png(a)


def bars(mask,geo):
    out=np.zeros((H,W,4),np.uint8)
    for value,indices in [(5,[geo['startLineSample']]),(6,geo['jumpRampSamples'])]:
        if not indices:continue
        components,num=label(mask==value)
        for component in range(1,num+1):
            ys,xs=np.where(components==component)
            if len(xs)<30:continue
            cx,cy=xs.mean(),ys.mean()
            p=min((geo['samples'][i] for i in indices),key=lambda p:(p['x']-cx)**2+(p['y']-cy)**2)
            normal=(np.array(p['left'])-np.array(p['right']))/p['width']
            tangent=np.array([-normal[1],normal[0]])
            along=(xs-cx)*normal[0]+(ys-cy)*normal[1]
            across=(xs-cx)*tangent[0]+(ys-cy)*tangent[1]
            if value==5:
                parity=((np.floor(along/22)+np.floor(across/22))%2)==0
                dark=(15,22,24,255);light=(239,235,214,255)
            else:
                parity=(np.floor((along+across)/23)%2)==0
                dark=(18,22,22,255);light=(250,203,46,255)
            out[ys,xs]=np.where(parity[:,None],dark,light)
    return png(out)


def kerbs(mask,geo):
    im=Image.new('RGB',(W,H),(233,224,202));d=ImageDraw.Draw(im)
    samples=geo['samples']
    for side in ['left','right']:
        for i in range(len(samples)):
            if (i//6)%2==0:
                pts=[tuple(samples[j%len(samples)][side]) for j in range(i,i+2)]
                d.line(pts,fill=(190,49,40),width=36)
    a=np.array(im)
    # A distressed stipple, rather than any displacement of the mask silhouette.
    yy,xx=np.indices((H,W));scuff=((xx*17+yy*37)%97)<3
    a[scuff]=(a[scuff].astype(float)*.69).astype(np.uint8)
    # Thin ink on both exact edges of the kerb band.
    red=mask==4
    edge=red & ~binary_erosion(red,iterations=1)
    a[edge]=(39,29,24)
    alpha=red.astype(np.uint8)*255
    return Image.fromarray(np.dstack([a,alpha]))


def track(n):
    geo=geometry(n);mask=load_mask(n);road=mask!=0
    tile=ground(n);tile.save(ROOT/f'tracks/track-{n}-texture.png')
    base=repeat(tile).convert('RGBA')
    base.alpha_composite(props(n,road,geo))
    base.alpha_composite(scene(n,road))
    for value,name in [(1,'asphalt'),(2,'gravel'),(3,'ice')]:
        if (mask==value).any():
            base.paste(texture(name),(0,0),Image.fromarray((mask==value).astype(np.uint8)*255))
    base.alpha_composite(road_details(n,mask,geo))
    base.alpha_composite(kerbs(mask,geo))
    base.alpha_composite(bars(mask,geo))
    a=np.array(base)
    yy,xx=np.indices((H,W));margin=np.minimum.reduce([xx,yy,W-1-xx,H-1-yy])
    fade=np.clip(margin/64,0,1);fade=fade*fade*(3-2*fade)
    # Only off-road pixels fade: fading the near-frame road would break physics.
    a[...,3]=np.where(road,255,np.rint(fade*255)).astype(np.uint8)
    main=png(a);main.save(ROOT/f'tracks/track-{n}.png')
    check=repeat(tile).convert('RGBA');check.alpha_composite(main)
    a=np.array(check);boundary=road & ~binary_erosion(road)
    a[boundary]=(0,255,255,255)
    png(a).save(ROOT/f'tracks/track-{n}-check.png')
    return main,tile,road


def cars():
    for i,name in enumerate(CAR_NAMES):
        im=Image.open(ROOT/f'sources/car-{name}.png').convert('RGBA')
        alpha=im.getchannel('A');bbox=alpha.point(lambda p:255 if p>32 else 0).getbbox()
        im=im.crop(bbox)
        # Wheel/body sizes are independent of the generated source resolution.
        sizes=[(112,68),(120,64),(116,66),(120,72),(116,70)]
        im=im.resize(sizes[i],RESAMPLE)
        sprite=Image.new('RGBA',(128,80))
        x=(128-im.width)//2;y=(80-im.height)//2
        # Dark 1 px ink reinforcement is visible after the 4:1 game reduction.
        silhouette=im.getchannel('A').filter(ImageFilter.MaxFilter(3))
        ink=Image.new('RGBA',im.size,(9,15,18,255));ink.putalpha(silhouette)
        sprite.alpha_composite(ink,(x,y));sprite.alpha_composite(im,(x,y))
        sprite.save(ROOT/f'cars/car-{name}.png')
    backgrounds=[(51,57,64),(186,151,94),(208,232,237),(65,86,48)]
    labels=['ASPHALT','GRAVEL','ICE','GRASS']
    font=ImageFont.load_default(size=14)
    check=Image.new('RGB',(620,304),(225,219,198));d=ImageDraw.Draw(check)
    d.text((16,10),'GAME SIZE: 32 x 20 px  /  nose points right',font=font,fill=(25,29,28))
    for i,name in enumerate(CAR_NAMES):d.text((151+i*90,40),name.upper(),font=ImageFont.load_default(size=11),fill=(25,29,28))
    for row,(bg,title) in enumerate(zip(backgrounds,labels)):
        y=64+row*55
        d.rectangle((0,y,619,y+54),fill=bg)
        fg=(245,240,222) if row in [0,3] else (25,29,28)
        d.text((16,y+19),title,font=font,fill=fg)
        for col,name in enumerate(CAR_NAMES):
            im=Image.open(ROOT/f'cars/car-{name}.png').resize((32,20),RESAMPLE)
            check.paste(im,(168+col*90,y+17),im)
    check.save(ROOT/'cars/cars-check.png')
    # Full-resolution inspection sheet, in addition to the mandatory tiny check.
    big=Image.new('RGB',(720,130),(215,215,200))
    for i,name in enumerate(CAR_NAMES):
        im=Image.open(ROOT/f'cars/car-{name}.png');big.paste(im,(10+i*142,15),im)
        ImageDraw.Draw(big).text((12+i*142,103),name.upper(),font=font,fill=(20,24,25))
    big.save(ROOT/'cars/cars-detail-check.png')


def extra_checks(n,main,tile):
    # 3 x 3 repeating tile; inspect both joins and the repeated motif at once.
    repeat(tile,1536,1536).save(ROOT/f'tracks/track-{n}-tile-check.png')
    canvases=[]
    for width,height in [(3120,1440),(2560,1920)]:
        # Keep the tile at the same phase relative to the centered main graphic.
        x=(width-W)//2;y=(height-H)//2
        a=np.array(tile)
        yy,xx=np.indices((height,width));ground_image=png(a[(yy-y)%512,(xx-x)%512]).convert('RGBA')
        ground_image.alpha_composite(main,(x,y))
        canvases.append(ground_image.resize((936,round(height/width*936)),RESAMPLE))
    sheet=Image.new('RGB',(936,sum(p.height for p in canvases)),(0,0,0));y=0
    for p in canvases:sheet.paste(p,(0,y));y+=p.height
    sheet.save(ROOT/f'tracks/track-{n}-aspect-check.png')


def main():
    for n in range(4):
        print(f'Building track {n}...',flush=True)
        im,tile,road=track(n);extra_checks(n,im,tile)
    cars()
    print('Art and visual checks complete.')


if __name__=='__main__':main()
