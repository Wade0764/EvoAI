# ===== v17 (E): auto VIN decode (p17). exec'd after patches_coowners =====
sub("function vinChanged(){\n  var ok=cleanVin().length===17;","function vinChanged(){\n  var ok=cleanVin().length===17;try{if(VIN.form&&VIN.form.vin!==cleanVin())VIN.form=null;vinAutoForm();}catch(e){}")
sub("    v.updatedAt=now;saved=v;","    v.updatedAt=now;saved=v;vinFormApply(v,false);")
sub("    vehicles.push(nv);saved=nv;","    vinFormApply(nv,true);vehicles.push(nv);saved=nv;")
sub("bld:v.isReplica?(v.builder||''):''};}","bld:v.isReplica?(v.builder||''):'',eng:v.engine||'',body:v.bodyClass||'',vdec:v.vinDecodedAt||''};}")
sub("isReplica:vrRep(r,x),builder:vrBld(r,x),","isReplica:vrRep(r,x),builder:vrBld(r,x),engine:cleanText(r.engine||x.eng,120),bodyClass:cleanText(r.body_class||x.body,80),vinDecodedAt:r.vin_decoded_at||x.vdec||'',")
sub("      chk(await sb.from('vehicles').insert(row));await vrSyncCols(v);","      chk(await sb.from('vehicles').insert(row));await vrSyncCols(v);await vinSyncCols(v);")
sub("notes:c.notes,archived:c.archived}).eq('id',v.id));\n          await vrSyncCols(v);","notes:c.notes,archived:c.archived}).eq('id',v.id));\n          await vrSyncCols(v);await vinSyncCols(v);")
# scan-document: a VIN printed on the document
sub("  DOCAI.fn=true;\n  DOCAI.edit.scan=s;","  DOCAI.fn=true;\n  DOCAI.edit.scan=s;\n  try{if(s.vin&&vinOk(s.vin)&&DOCAI.edit.vehicleId){var _dv=byId(getVehicles(),DOCAI.edit.vehicleId);if(_dv&&vinNorm(_dv.vin)!==vinNorm(s.vin))setTimeout(function(){vinApplyToVehicle(_dv.id,s.vin,'ask','The document shows VIN '+vinNorm(s.vin)+': ');},400);}}catch(e){}")
# pull-to-refresh: one-time VIN backfill (max 5) before the missing-estimate pass
sub("  return Promise.resolve(reloadAll(true)).then(function(){var n=valueAutoMissing(AUTOV.max);","  return Promise.resolve(reloadAll(true)).then(function(){return vinBackfill().catch(function(){});}).then(function(){var n=valueAutoMissing(AUTOV.max);")
sub("function fillFromVin(){\n  var vin=cleanVin();","function fillFromVin(){\n  var vin=cleanVin();\n  if(vinOk(vin)&&!vinFormReplica()){VIN.form=null;clearTimeout(VIN.tm);vinFormDecode();return;}")
js=js.rstrip()+'\n'+open(T+'p17_vin.js').read()+'\n'
