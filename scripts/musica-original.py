#!/usr/bin/env python3
"""Genera una pista de música ORIGINAL (sin derechos de autor) para los Reels. Uso: python3 scripts/musica-original.py salida.wav  (requiere numpy)"""
import numpy as np, wave
sr=44100; bpm=122; beat=60/bpm; bars=6; total=bars*4*beat+1.0
N=int(total*sr); rng=np.random.default_rng(7)
L=np.zeros(N); R=np.zeros(N)
def add(buf, start, sig, gain=1.0):
    i=int(start*sr); j=min(N,i+len(sig))
    if i<N: buf[i:j]+=sig[:j-i]*gain
def env(n,a=0.005,d=0.2,sus=0.0,r=0.05):
    t=np.arange(n)/sr; e=np.exp(-t/d)*(1-sus)+sus; e*=np.minimum(1,t/max(a,1e-4)); return e
def lp(x,fc):
    a=np.exp(-2*np.pi*fc/sr); y=np.zeros_like(x); s=0.0
    for k in range(len(x)): s=(1-a)*x[k]+a*s; y[k]=s
    return y
def hp(x,fc): return x-lp(x,fc)
def kick():
    n=int(0.22*sr); t=np.arange(n)/sr; f=50+90*np.exp(-t/0.03); ph=2*np.pi*np.cumsum(f)/sr
    return np.sin(ph)*np.exp(-t/0.09)
def clap():
    n=int(0.18*sr); x=rng.standard_normal(n)*np.exp(-np.arange(n)/sr/0.04); return hp(x,1200)*0.6
def hat(open_=False):
    n=int((0.12 if open_ else 0.04)*sr); x=rng.standard_normal(n)*np.exp(-np.arange(n)/sr/(0.05 if open_ else 0.012)); return hp(x,6000)*0.35
def pluck(f,dur=0.35):
    n=int(dur*sr); t=np.arange(n)/sr; x=(2*(t*f%1)-1)*0.6+np.sin(2*np.pi*f*t)*0.4; return x*np.exp(-t/0.12)
def bass(f,dur):
    n=int(dur*sr); t=np.arange(n)/sr; x=np.sign(np.sin(2*np.pi*f*t))*0.5+np.sin(2*np.pi*f*t)*0.5; x=lp(x,300); return x*np.minimum(1,t/0.01)*np.exp(-t/(dur*1.2))
def pad(freqs,dur):
    n=int(dur*sr); t=np.arange(n)/sr; x=sum(np.sin(2*np.pi*f*t)+0.5*np.sin(2*np.pi*f*2*t+0.3) for f in freqs)/len(freqs)
    return x*np.minimum(1,t/0.25)*np.minimum(1,(dur-t)/0.25)
chords=[([220.0,261.63,329.63],55.0),([174.61,220.0,261.63],43.65),([261.63,329.63,392.0],65.41),([196.0,246.94,293.66],49.0)]  # Am F C G
for b in range(bars):
    notes,root=chords[b%4]; t0=b*4*beat
    add(L,t0,pad(notes,4*beat),0.10); add(R,t0,pad([f*1.003 for f in notes],4*beat),0.10)
    for k in range(4):
        tb=t0+k*beat; kk=kick(); add(L,tb,kk,0.9); add(R,tb,kk,0.9)
        if k in (1,3): c=clap(); add(L,tb,c,0.55); add(R,tb+0.003,c,0.55)
    for k in range(8):
        te=t0+k*beat/2
        if k%2==1: h=hat(open_=(k==7)); add(L,te,h,0.5); add(R,te+0.002,h,0.5)
        bs=bass(root*(2 if k%4==3 else 1),beat/2*0.95); add(L,te,bs,0.55); add(R,te,bs,0.55)
        f=notes[[0,1,2,1,0,1,2,1][k]]*2; p=pluck(f); add(L,te,p,0.20 if k%2==0 else 0.14); add(R,te+0.004,p,0.14 if k%2==0 else 0.2)
m=np.maximum(np.abs(L).max(),np.abs(R).max()); L/=m; R/=m
# suavizado final y fundidos
fi=int(0.05*sr); fo=int(1.2*sr); w=np.ones(N); w[:fi]=np.linspace(0,1,fi); w[-fo:]=np.linspace(1,0,fo); L*=w*0.89; R*=w*0.89
st=np.stack([L,R],1); pcm=(np.clip(st,-1,1)*32767).astype('<i2')
with wave.open(f'{__import__("sys").argv[1]}','wb') as f: f.setnchannels(2); f.setsampwidth(2); f.setframerate(sr); f.writeframes(pcm.tobytes())
print('musica', round(total,1),'s  pico',float(np.abs(st).max()),'rms',float(np.sqrt((st**2).mean())))
