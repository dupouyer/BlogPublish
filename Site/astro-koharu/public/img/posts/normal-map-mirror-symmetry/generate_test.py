"""Generate an X-symmetric height/normal pair. Requires numpy and Pillow.
Image U points right, V points down; normal Y is relative to increasing V.
Confirm the target engine's green convention separately.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
SIZE = 512
axis = (np.arange(SIZE, dtype=np.float64) + .5) / SIZE
u, v = np.meshgrid(axis, axis)

def height(u, v, asym=0):
    x, y = 2*u-1, 2*v-1
    return (.3*np.exp(-5*(x*x+y*y))
            + .11*np.cos(4*np.pi*x)*np.exp(-2*y*y)
            + .06*np.cos(7*np.pi*x)*np.cos(3*np.pi*y)
            + asym*.14*np.sin(5*x+3*y+.4)*np.exp(-1.5*(x*x+y*y))
            + asym*.08*np.sin(9*x-4*y+1)*np.exp(-3*((x-.2)**2+y*y)))

def normal(u, v, asym=0):
    e = 1/2048
    hu = (height(u+e, v, asym)-height(u-e, v, asym))/(2*e)
    hv = (height(u, v+e, asym)-height(u, v-e, asym))/(2*e)
    n = np.stack([-hu, -hv, np.ones_like(hu)], axis=-1)
    return n/np.linalg.norm(n, axis=-1, keepdims=True)

def mirrored(n):
    n = n[:, ::-1].copy()
    n[..., 0] *= -1
    return n

n = normal(u, v)
h = height(u, v)
encoded = np.round((n*.5+.5)*255).astype(np.uint8)
Image.fromarray(encoded).save(ROOT/'symmetric-normal.png')
# Store signed height in a fixed affine interval [-.25,.55].
Image.fromarray(np.round(np.clip((h+.25)/.8,0,1)*65535).astype(np.uint16)).save(ROOT/'symmetric-height-16.png')
expected = mirrored(n)
error = np.max(np.abs(n-expected))
assert error < 1e-10
assert np.max(np.abs(np.linalg.norm(n, axis=-1)-1)) < 1e-12
bad = normal(u, v, .55)
assert np.mean(np.linalg.norm(bad-mirrored(bad), axis=-1)) > .01
# De-mirror sample coordinates, then X channel, then mirrored TBN.
restored = normal(1-(1-u), v, .55).copy()
restored[..., 0] *= -1
restored[..., 0] *= -1
assert np.max(np.abs(restored-bad)) < 1e-10
print(f'Float unit-normal error < 1e-12; symmetry max-component error={error:.3g}')
print('Both-compensation restores the normal field; asymmetric counterexample verified.')
print('8-bit encoding is quantized: exact unit length is only guaranteed before quantization.')

L = np.array([-.65,.25,.8]); L /= np.linalg.norm(L)
fontpath = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
try:
    font = ImageFont.truetype(fontpath, 23)
    small = ImageFont.truetype(fontpath, 19)
except OSError:
    font = ImageFont.load_default(size=23)
    small = ImageFont.load_default(size=19)
canvas = Image.new('RGB',(1200,720),'#101722'); d=ImageDraw.Draw(canvas)
d.text((30,15),'X MIRROR: SAME NORMAL FIELD OR MIRRORED RELIEF?',font=font,fill='#edf2f8')
for row,asym in enumerate([0,.55]):
    field=normal(u,v,asym)
    fields=[field,mirrored(field),field]
    label='SYMMETRIC HEIGHT' if row==0 else 'ASYMMETRIC HEIGHT'
    d.text((30,60+row*320),label,font=small,fill='#71dace')
    for col,normals in enumerate(fields):
        q=.12+.88*np.maximum(0,np.sum(normals*L,axis=-1))
        rgb=np.round(q[...,None]*np.array([225,198,163])).astype(np.uint8)
        tile=Image.fromarray(rgb).resize((260,260),Image.Resampling.LANCZOS)
        canvas.paste(tile,(40+col*390,92+row*320))
        d.text((40+col*390,355+row*320),['ScaleX +1','ScaleX -1','-1 + UV/Nx compensation'][col],font=small,fill='#e9edf5')
canvas.save(ROOT/'comparison.png',optimize=True)
