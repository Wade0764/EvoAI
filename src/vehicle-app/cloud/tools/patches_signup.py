# v27 sign-up: append p27 (later function declarations override p2_auth versions)
js=js.rstrip()+'\n'+open(T+'p27_signup.js').read()+'\n'
js=js.rstrip()+'\n'+open(T+'p27_formsafe.js').read()+'\n'
