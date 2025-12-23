#=========================================================================#
# CHGK Web Template (HTTP)                                               #
# Routes /api/*, /ws, /uploads/*, /health -> backend on 127.0.0.1:4000     #
# Everything else -> frontend (Next.js) on 127.0.0.1:3000                #
# Adjust ports above if your services listen elsewhere.                  #
#=========================================================================#

server {
	listen      %ip%:%proxy_port%;
	server_name %domain_idn% %alias_idn%;
	error_log   /var/log/%web_system%/domains/%domain%.error.log error;
	access_log  /var/log/%web_system%/domains/%domain%.log combined;
	access_log  /var/log/%web_system%/domains/%domain%.bytes bytes;

	include %home%/%user%/conf/web/%domain%/nginx.forcessl.conf*;

	client_max_body_size 25m;
	proxy_read_timeout   300s;
	proxy_send_timeout   300s;

	# Local upstreams
	set $backend  http://127.0.0.1:4000;
	set $frontend http://127.0.0.1:3000;

	location ~ /\.(?!well-known\/|file) {
		deny all;
		return 404;
	}

	location ^~ /api/ {
		proxy_pass $backend;
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
		proxy_set_header X-Forwarded-Host $host;
		proxy_set_header X-Forwarded-Port $server_port;
	}

	location = /health {
		proxy_pass $backend;
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
		proxy_set_header X-Forwarded-Host $host;
		proxy_set_header X-Forwarded-Port $server_port;
	}

	location ^~ /uploads/ {
		alias %home%/%user%/web/%domain%/chgk/back/dist/uploads/;
		try_files $uri =404;
		expires 7d;
		add_header Cache-Control "public";
	}

	location ^~ /media/ {
		alias %home%/%user%/web/%domain%/chgk/front/public/media/;
		try_files $uri =404;
		expires 7d;
		add_header Cache-Control "public";
	}

	location ^~ /ws {
		proxy_pass http://127.0.0.1:4000;
		proxy_http_version 1.1;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection "upgrade";
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
		proxy_read_timeout 600s;
		proxy_send_timeout 600s;
		proxy_buffering off;
	}

	location ~* ^/(?:_next/static|static)/ {
		expires 30d;
		add_header Cache-Control "public, immutable";
		proxy_pass $frontend;
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
		proxy_set_header X-Forwarded-Host $host;
		proxy_set_header X-Forwarded-Port $server_port;
	}

	location / {
		proxy_pass $frontend;
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
		proxy_set_header X-Forwarded-Host $host;
		proxy_set_header X-Forwarded-Port $server_port;
		proxy_redirect off;
	}

	location /error/ {
		alias %home%/%user%/web/%domain%/document_errors/;
	}

	include %home%/%user%/conf/web/%domain%/nginx.conf_*;
}
