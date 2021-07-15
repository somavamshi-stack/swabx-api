openssl genrsa > keys/id_rsa_priv.pem
openssl rsa -in keys/id_rsa_priv.pem -pubout -out keys/id_rsa_pub.pem