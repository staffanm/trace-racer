#!/usr/bin/env python3
"""Audit final PNGs independently of the compositor; write validation.json."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import label, binary_erosion, distance_transform_edt

ROOT=Path(__file__).resolve().parents[1]
PALETTE=np.array([(0,0,0),(128,128,128),(200,160,96),(160,224,255),
                  (255,0,0),(255,255,255),(255,255,0)],np.int32)


def read(path,size,mode=None):
    im=Image.open(ROOT/path)
    assert im.format=='PNG',path
    assert im.size==size,(path,im.size)
    if mode:assert im.mode==mode,(path,im.mode)
    im.verify()
    return np.array(Image.open(ROOT/path))


def main():
    result={'tracks':[],'cars':[]}
    for n in range(4):
        image=read(f'tracks/track-{n}.png',(2560,1440),'RGBA')
        tile=read(f'tracks/track-{n}-texture.png',(512,512),'RGB')
        check=read(f'tracks/track-{n}-check.png',(2560,1440),'RGBA')
        ref=read(f'reference/track-{n}-mask.png',(2560,1440),'RGBA')[...,:3].astype(np.int32)
        masks=np.argmin(np.stack([np.sum((ref-c)**2,axis=2) for c in PALETTE]),axis=0)
        road=masks!=0
        assert np.all(image[road,3]==255),'Transparent road pixels'
        yy,xx=np.indices(road.shape)
        tiled=tile[yy%512,xx%512]
        # Every offroad fade pixel retains exactly the tile beneath it: no seam.
        margin=np.minimum.reduce([xx,yy,2559-xx,1439-yy])
        fade_zone=(margin<64)&~road
        assert np.array_equal(image[fade_zone,:3],tiled[fade_zone]),'Margin color mismatch'
        assert np.all(image[margin==0,3]==0),'Visible perimeter'
        assert np.array_equal(tile[0],tile[-1]),'Vertical tile seam'
        assert np.array_equal(tile[:,0],tile[:,-1]),'Horizontal tile seam'
        # Recover the kerbs from the final art's five real ink/paint colors.
        # No build functions or intermediate clipping masks are used here.
        kerb_colors=[(233,224,202),(190,49,40),(160,154,139),(131,33,27),(39,29,24)]
        recovered=np.zeros(road.shape,bool)
        for color in kerb_colors:recovered|=np.all(image[...,:3]==color,axis=2)
        components,count=label(recovered)
        sizes=np.bincount(components.ravel())
        good=np.flatnonzero(sizes>1000);good=good[good!=0]
        recovered=np.isin(components,good)
        expected=masks==4
        assert recovered.any(),'Kerbs missing'
        error=max(float(distance_transform_edt(~expected)[recovered].max()),
                  float(distance_transform_edt(~recovered)[expected].max()))
        assert error<=3,(n,'Kerb edge disagreement',error)
        # The one-pixel cyan contour must be the real mask contour, unchanged.
        cyan=np.all(check[...,:3]==(0,255,255),axis=2)
        boundary=road&~binary_erosion(road)
        assert np.array_equal(cyan,boundary),'Cyan check contour differs from mask'
        # Finish/ramp bars all retain opaque light and dark pattern coverage.
        for value in [5,6]:
            selected=masks==value
            if selected.any():
                rgb=image[selected,:3]
                dark=np.all(rgb==(15,22,24) if value==5 else rgb==(18,22,22),axis=1)
                light=np.all(rgb==(239,235,214) if value==5 else rgb==(250,203,46),axis=1)
                assert np.all(dark|light),'Incorrect finish or ramp pixels'
                assert dark.sum()>100 and light.sum()>100,'Unstriped bar'
        geo=json.loads((ROOT/f'reference/track-{n}-geometry.json').read_text())
        result['tracks'].append({'track':n,'size':[2560,1440],'kerb_max_error_px':error,
             'opaque_road':True,'tile_size':[512,512],'tile_edge_difference':0,
             'offroad_fade_width_px':64,'margin_color_difference':0,
             'cyan_contour_matches_mask':True,'jump_ramps':len(geo['jumpRampSamples'])})
    for name in ['player','steady','balanced','hotshot','reckless']:
        im=read(f'cars/car-{name}.png',(128,80),'RGBA')
        alpha=im[...,3]
        assert alpha.min()==0 and alpha.max()==255,'Missing car transparency'
        assert not alpha[0].any() and not alpha[-1].any(),'Car at vertical edge'
        assert not alpha[:,0].any() and not alpha[:,-1].any(),'Car at horizontal edge'
        ys,xs=np.where(alpha>32)
        bounds=[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)]
        assert bounds[2]-bounds[0]<=122 and bounds[3]-bounds[1]<=74
        rgb=im[alpha>220,:3].astype(int)
        # Ink must occupy enough of the actual sprite to read on light surfaces.
        dark=np.max(rgb,axis=1)<80
        assert dark.mean()>.12,'Car lacks strong black ink'
        result['cars'].append({'name':name,'size':[128,80],'opaque_ink_fraction':round(float(dark.mean()),3),
                               'bounds':bounds,'transparent_background':True})
    read('cars/cars-check.png',(620,304),'RGB')
    result['status']='passed'
    (ROOT/'scripts/validation.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))


if __name__=='__main__':main()
