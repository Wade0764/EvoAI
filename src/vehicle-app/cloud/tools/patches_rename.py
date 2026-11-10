# v28 rename collection: titles and the View-as picker use the collection name (profiles.collection_name)
sub("ctitleSet('cd-name',c.name);","ctitleSet('cd-name',collName(c),!!collCustom(c));")
sub("ctitleSet('cp-title',client.name);","ctitleSet('cp-title',collName(client),!!collCustom(client));")
sub("'>'+esc(clients[i].name)+'</option>';","'>'+esc(collName(clients[i]))+'</option>';")
js=js.rstrip()+'\n'+open(T+'p28_rename.js').read()+'\n'
