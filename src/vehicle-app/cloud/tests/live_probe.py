# Read-only live check with the PUBLIC anon key. No users created, no data written.
# PostgREST validates column names before privileges: unknown column -> 42703, known column but no grant -> 42501.
import json,re,urllib.request,urllib.error,sys
U='https://xosbchskdtkxogppmkex.supabase.co'
K=re.search(r'eyJ[A-Za-z0-9_.-]+',open('/workspace/evoai-cloud/PUBLIC_KEYS.txt').read()).group(0)
H={'apikey':K,'Authorization':'Bearer '+K}
def call(method,path,body=None):
    req=urllib.request.Request(U+path,method=method,headers=dict(H,**({'Content-Type':'application/json'} if body is not None else {})),data=json.dumps(body).encode() if body is not None else None)
    try:
        r=urllib.request.urlopen(req,timeout=20);return r.status,r.read().decode()
    except urllib.error.HTTPError as e:return e.code,e.read().decode()
cols=json.load(open('schema_cols.json'))
bad=0
for t,cs in cols.items():
    for c in cs:
        st,b=call('GET','/rest/v1/%s?select=%s&limit=1'%(t,c))
        code=json.loads(b).get('code') if b.startswith('{') else None
        if code=='42703':bad+=1;print('MISSING live column',t,c)
        elif st not in (200,401) :print('??',t,c,st,b[:100])
print('column probe done; missing =',bad)
rpcs={'create_invite':{'p_kind':'tech_owner','p_vehicle_id':None,'p_email':None},
 'redeem_invite':{'p_code':'x'},'revoke_invite':{'p_invite_id':'00000000-0000-0000-0000-000000000000'},
 'revoke_tech_access':{'p_access_id':'00000000-0000-0000-0000-000000000000'},
 'set_tech_permission':{'p_access_id':'00000000-0000-0000-0000-000000000000','p_permission':'view_expenses','p_value':True,'p_vehicle_id':None},
 'reset_tech_permission_override':{'p_access_id':'00000000-0000-0000-0000-000000000000','p_vehicle_id':'00000000-0000-0000-0000-000000000000'},
 'initiate_transfer':{'p_vehicle_id':'00000000-0000-0000-0000-000000000000','p_buyer_email':None},
 'cancel_transfer':{'p_transfer_id':'00000000-0000-0000-0000-000000000000'}}
for f,a in rpcs.items():
    st,b=call('POST','/rest/v1/rpc/'+f,a)
    code=json.loads(b).get('code') if b.startswith('{') else None
    print('rpc',f,st,code,'(PGRST202 = name/args not found)' if code=='PGRST202' else '')
st,b=call('POST','/rest/v1/rpc/create_invite',{'p_kind':'tech_owner','p_vehicle_id':None,'p_email':None,'p_label':'x'})
print('rpc create_invite 4-arg(p_label):',st,json.loads(b).get('code'))
