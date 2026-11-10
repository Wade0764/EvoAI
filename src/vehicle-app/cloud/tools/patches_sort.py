# v29 sort by: apply the chosen order to the carousel and the client collection list (move mode keeps My order)
sub("vehicles=phSorted(vehicles);elHTML(p+'-vehicles'","vehicles=stApply(phSorted(vehicles));elHTML(p+'-vehicles'")
sub("elHTML('cd-vehicles',vehicles.length?vehicles.map(function(v){return vehicleCardHTML(v);})","elHTML('cd-vehicles',vehicles.length?stApply(phSorted(vehicles)).map(function(v){return vehicleCardHTML(v);})")
js=js.rstrip()+'\n'+open(T+'p29_sort.js').read()+'\n'
