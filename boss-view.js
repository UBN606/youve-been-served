import * as THREE from 'three';
import {loadCitizens} from './crowd-assets.js';

export async function createBossView(scene){
  const [actor]=await loadCitizens(1);
  const group=new THREE.Group();group.name='Caligastia influence encounter';group.position.set(0,0,-9);group.visible=false;
  actor.group.scale.setScalar(1.4);group.add(actor.group);
  actor.group.traverse(o=>{if(!o.isMesh)return;const ms=Array.isArray(o.material)?o.material:[o.material];o.material=ms.map(m=>{const n=m.clone();if(!m.map)n.color.lerp(new THREE.Color('#301c49'),.72);n.roughness=.65;return n;});if(o.material.length===1)o.material=o.material[0];});
  const ringMaterial=new THREE.MeshBasicMaterial({color:'#b99ce8',transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false});
  const crown=new THREE.Group();crown.position.y=2.93;
  for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(.42+i*.1,.017,8,64),ringMaterial);ring.rotation.x=Math.PI/2+i*.17;crown.add(ring);}group.add(crown);
  const shell=new THREE.Mesh(new THREE.SphereGeometry(1,48,32),new THREE.MeshPhysicalMaterial({color:'#67458e',transparent:true,opacity:.13,roughness:.1,metalness:.3,side:THREE.DoubleSide,depthWrite:false}));shell.position.y=1.4;shell.scale.set(1.6,2,1.6);group.add(shell);
  const seal=new THREE.Mesh(new THREE.RingGeometry(2.4,2.46,96),ringMaterial);seal.rotation.x=-Math.PI/2;seal.position.y=.04;group.add(seal);
  const tetherGeometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
  const tether=new THREE.Line(tetherGeometry,new THREE.LineBasicMaterial({color:'#d5a5e8',transparent:true,opacity:.65}));scene.add(tether);tether.visible=false;
  const bolts=[],geom=new THREE.IcosahedronGeometry(.19,2),material=new THREE.MeshStandardMaterial({color:'#e7a3d2',emissive:'#863477',emissiveIntensity:1.2,roughness:.22});
  scene.add(group);
  let shotClock=0,lastAttack=-1;
  function clear(){for(const b of bolts)scene.remove(b.mesh);bolts.length=0;tether.visible=false;shotClock=0;lastAttack=-1;}
  return {group,clear,
    update(dt,time,boss,hero,onContact){
      group.visible=boss.active||boss.defeated;
      if(!group.visible){clear();return;}
      actor.update(dt,{time,speed:0,rescuing:boss.active&&boss.tellLeft>0,saved:boss.defeated});
      group.rotation.y=Math.atan2(hero.x-group.position.x,hero.z-group.position.z);
      crown.rotation.y=time*.3;crown.visible=!boss.defeated;shell.visible=boss.active&&boss.exposedLeft<=0;seal.visible=boss.active;
      if(boss.defeated){tether.visible=false;clear();return;}
      if(dt<=0)return;
      const col=new THREE.Color(boss.attack.color);ringMaterial.color.copy(col);material.color.copy(col);
      if(lastAttack!==boss.phaseIndex){lastAttack=boss.phaseIndex;shotClock=0;}
      const kind=boss.attack.kind;
      tether.visible=(kind==='tether'||kind==='pull')&&boss.tellLeft<=0&&boss.guardLeft<=0;
      if(tether.visible){const a=tether.geometry.attributes.position;a.setXYZ(0,group.position.x,1.6,group.position.z);a.setXYZ(1,hero.x,1.15,hero.z);a.needsUpdate=true;}
      shotClock-=dt;
      if(boss.tellLeft<=0&&shotClock<=0){
        shotClock=kind==='ring'?.8:1.15;
        const toward=new THREE.Vector3(hero.x-group.position.x,0,hero.z-group.position.z).normalize();
        const count=kind==='ring'?7:kind==='orbit'?5:kind==='mirror'?2:1;
        for(let i=0;i<count;i++){const direction=toward.clone().applyAxisAngle(new THREE.Vector3(0,1,0),(i-(count-1)/2)*.22);const mesh=new THREE.Mesh(geom,material);mesh.position.copy(group.position);mesh.position.y=1.2;scene.add(mesh);bolts.push({mesh,direction,life:5,speed:kind==='pull'?5:7});}
      }
      for(let i=bolts.length-1;i>=0;i--){const b=bolts[i];b.life-=dt;b.mesh.position.addScaledVector(b.direction,dt*b.speed);b.mesh.rotation.y+=dt*4;
        const distance=Math.hypot(b.mesh.position.x-hero.x,b.mesh.position.z-hero.z);
        if(distance<(boss.guardLeft>0?2.2:.6)){onContact?.(boss.guardLeft>0,b.mesh.position.clone());b.life=0;}
        if(b.life<=0){scene.remove(b.mesh);bolts.splice(i,1);}
      }
    }
  };
}
