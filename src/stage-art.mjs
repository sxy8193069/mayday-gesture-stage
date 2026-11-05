const colors=['#ff4e40','#ffcd38','#f486bd','#30bff2','#27cf8a'];
// 填写相对于本模块的图片路径，或保留 null 使用默认五色主屏。
const customStageScreen=null;
function canvas(width,height){const c=document.createElement('canvas');c.width=width;c.height=height;return c;}

function crown(d,x,y,size,color='#f4f9ff'){
  d.save();d.translate(x,y);d.scale(size,size);d.strokeStyle=color;d.lineWidth=.027;d.lineJoin='miter';d.lineCap='butt';
  // 冠形保留三处尖角、中央竖线及底部凹口。
  const lines=[[-.51,.48,-.50,-.38,0,.06,.53,-.38,.51,.48,.105,.48,0,.355,-.105,.48,-.51,.48],[-.34,.48,.01,-.73,.34,.48],[0,.06,0,.355]];
  for(const line of lines){d.beginPath();d.moveTo(line[0],line[1]);for(let i=2;i<line.length;i+=2)d.lineTo(line[i],line[i+1]);d.stroke();}
  d.restore();
}
function wordmark(d,x,y,size,color='#f4f9ff',width=size*7.8){
  d.save();d.fillStyle=color;d.font=`500 ${size}px Arial`;d.textAlign='left';d.textBaseline='middle';
  const word='MAYDAY',widths=[...word].map(letter=>d.measureText(letter).width),spacing=(width-widths.reduce((a,b)=>a+b,0))/5;
  let cursor=x-width/2;for(let i=0;i<word.length;i++){d.fillText(word[i],cursor,y);cursor+=widths[i]+spacing;}d.restore();
}
export async function buildStageArtwork(){
  const main=canvas(2304,720),d=main.getContext('2d');
  if(customStageScreen){
    const image=new Image();image.src=new URL(customStageScreen,import.meta.url).href;await image.decode();
    d.drawImage(image,0,0,2304,720);
  }else{
    d.fillStyle='#030712';d.fillRect(0,0,2304,720);
    for(let i=0;i<5;i++){
      const x=i*461,gradient=d.createLinearGradient(x,0,x+440,720);
      gradient.addColorStop(0,colors[i]);gradient.addColorStop(.52,'#18233c');gradient.addColorStop(1,'#050911');
      d.fillStyle=gradient;d.fillRect(x+8,8,445,704);
      d.fillStyle=colors[i];d.fillRect(x+8,648,445,10);
    }
    d.fillStyle='#050915';d.globalAlpha=.4;d.fillRect(0,0,2304,720);d.globalAlpha=1;
    d.textAlign='center';d.textBaseline='middle';d.fillStyle='#edf6ff';
    d.font='600 80px Arial';d.fillText('M A Y D A Y',1152,110);
    d.shadowColor='#83d7ff';d.shadowBlur=30;d.font='900 450px Arial';d.fillText('5525',1152,405);d.shadowBlur=0;
  }
  const brand=canvas(768,768),b=brand.getContext('2d');b.fillStyle='#030305';b.fillRect(0,0,768,768);
  b.fillStyle='#f3f3ef';b.font='400 34px Arial';b.textAlign='center';b.fillText('25',384,65);crown(b,384,366,360,'#f3f3ef');wordmark(b,384,626,43,'#f3f3ef',606);
  const kick=canvas(768,768),k=kick.getContext('2d');k.fillStyle='#f2eedf';k.fillRect(0,0,768,768);crown(k,384,342,330,'#27272a');wordmark(k,384,589,31,'#27272a',345);
  const apron=canvas(1024,1024),a=apron.getContext('2d');a.fillStyle='#0a0c12';a.fillRect(0,0,1024,1024);
  a.strokeStyle='#ebf5ff';a.lineWidth=10;a.beginPath();a.arc(512,512,480,0,Math.PI*2);a.stroke();
  for(let i=0;i<5;i++){
    a.fillStyle=colors[i];const x=192+i*143;a.fillRect(x,178+(i%2)*12,85,220-(i%2)*12);a.fillRect(x,660,85,191+(i%2)*12);
  }
  a.fillStyle='#1a2d42';a.fillRect(378,397,268,220);a.strokeStyle='#bdd6e7';a.lineWidth=3;a.strokeRect(378,397,268,220);crown(a,512,490,147);wordmark(a,512,584,21);wordmark(a,512,910,43);
  return {main,brand,kick,apron};
}
