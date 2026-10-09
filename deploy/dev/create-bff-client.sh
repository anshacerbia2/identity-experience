#!/usr/bin/env bash
# Registers identity-experience-bff in the development kernel. The client authenticates with the
# BFF's own key by signed JWT (private_key_jwt) and holds no secret (ADR-IAM-001 §5.12). Run once, on
# the server, by whoever operates it:
#
#   ./create-bff-client.sh /path/to/identity-control/deploy/dev/.env /path/to/identity-experience-bff.jwk.json
#
# The first argument is the file that already holds the kernel's Keycloak container name, its
# bootstrap administrator and its key tools (KERNEL_KEYCLOAK_CONTAINER, KC_BOOTSTRAP_ADMIN_USERNAME,
# KC_BOOTSTRAP_ADMIN_PASSWORD, KERNEL_DEPLOY_DIR), so no password is typed on a command line or copied
# into a second file. The second is the public JWK the developer made with
# scripts/new-client-key.mjs. The private key stays on the developer's machine; nothing secret
# crosses to the server, and nothing is printed.
#
#   identity-experience-bff  the BFF's confidential client (TDD-identity-experience-001).
#                            Authorization Code with PKCE S256 and nothing else: no password grant,
#                            no implicit flow, no service account (STD-IAM-001 §3.2). The kernel's
#                            scnehaux-provider scope attached and identity-control-api named in aud, so
#                            its access tokens are what the Identity Control API accepts
#                            (STD-IAM-002 §3.1.1). PS256 for the ID token as well as the access
#                            token, because the BFF accepts no other algorithm. A 240-second access
#                            token: provider-scope is lifetime class L0 (§3.3).
#
# The redirect URI is the BFF running on a developer's machine, http://127.0.0.1:8090. Not
# localhost:8080: the dev tunnel forwards the server's port 8080 and rewrites any redirect to
# localhost:8080 into the tunnel's own URL, which sent the first real sign-in back to Keycloak
# instead of the BFF. A port the tunnel does not forward is left alone. Keycloak
# cannot reach that machine, so no back-channel logout URL is registered (ADR-IAM-009 §5.3); a
# session removed in the kernel still ends the BFF session at its next refresh, within four minutes.
# Front-channel logout is off (ADR-IAM-009 §5.2), as identity-control writes it on every client.
#
# It creates this one client and changes nothing else: no realm setting, no scope, no other client.
# It refuses when the client exists. A second developer's key, or a new key, is installed with the
# kernel's set-client-key.sh instead (README.md). identity-control's create-kernel-clients.sh and
# dev-keycloak.ps1 are never run for this.
#
# Superseded. identity-control registers confidential clients with their keys now
# (TDD-identity-control-003), so a new server registers the BFF through POST /v1/registrations as
# privileged, provider-scope. A client this script already made is adopted with identity-control's
# scripts/dev-adopt-bff.ps1, a plan first (TDD-identity-experience-001 1.14.0). Do not run this for a
# client that exists; it refuses, and the adoption is the way forward.
set -euo pipefail

if [ "$#" -ne 2 ] || [ ! -r "$1" ] || [ ! -r "$2" ]; then
	echo "usage: $0 /path/to/identity-control/deploy/dev/.env /path/to/identity-experience-bff.jwk.json" >&2
	exit 2
fi
jwk="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"

set -a
# shellcheck disable=SC1090
. "$1"
set +a

container="${KERNEL_KEYCLOAK_CONTAINER:-scnehaux-identity-dev-keycloak-1}"
realm=scnehaux
client=identity-experience-bff
redirect_uri=http://127.0.0.1:8090/auth/callback
kernel="${KERNEL_DEPLOY_DIR:?the identity-control .env must set KERNEL_DEPLOY_DIR to the deploy/dev directory of the kernel checkout}"

kc() {
	docker exec -i "$container" /opt/keycloak/bin/kcadm.sh "$@" --config /tmp/kcadm-identity-experience-bff.config
}

kc config credentials --server http://localhost:8080 --realm master \
	--user "${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null

if [ -n "$(kc get clients -r "$realm" -q "clientId=$client" --fields id --format csv --noquotes | head -n 1)" ]; then
	echo "create-bff-client: $client already exists in realm $realm; nothing created." >&2
	echo "To install a key on it: $kernel/set-client-key.sh $realm $client JWK [JWK]" >&2
	exit 1
fi

scope="$(kc get client-scopes -r "$realm" --fields id,name --format csv --noquotes | grep ',scnehaux-provider$' | cut -d, -f1 || true)"
if [ -z "$scope" ]; then
	echo "create-bff-client: realm $realm has no scnehaux-provider scope. Apply identity-kernel's realm" >&2
	echo "definition first (realm-apply), which declares it." >&2
	exit 1
fi

uuid="$(kc create clients -r "$realm" -i \
	-s clientId="$client" -s enabled=true -s publicClient=false \
	-s clientAuthenticatorType=client-jwt \
	-s serviceAccountsEnabled=false -s standardFlowEnabled=true \
	-s directAccessGrantsEnabled=false -s implicitFlowEnabled=false \
	-s frontchannelLogout=false \
	-s "redirectUris=[\"$redirect_uri\"]" -s 'webOrigins=[]' \
	-s 'attributes."pkce.code.challenge.method"=S256' \
	-s 'attributes."access.token.signed.response.alg"=PS256' \
	-s 'attributes."id.token.signed.response.alg"=PS256' \
	-s 'attributes."access.token.lifespan"=240')"
# The audience belongs to the client relationship, not to the claim profile, as on
# identity-control-caller: the provider scope does not make every provider token valid at every API.
# It names identity-control-api, the Identity Control API's keyless resource, never its Admin API
# client (STD-IAM-002 §3.1), written exactly as identity-control writes an audience mapper, so the
# adopted BFF's declared audience matches it.
kc create "clients/$uuid/protocol-mappers/models" -r "$realm" \
	-s name=audience-identity-control-api -s protocol=openid-connect -s protocolMapper=oidc-audience-mapper \
	-s 'config."included.client.audience"=identity-control-api' \
	-s 'config."access.token.claim"=true' -s 'config."id.token.claim"=false' \
	-s 'config."introspection.token.claim"=true' >/dev/null
kc update "clients/$uuid/default-client-scopes/$scope" -r "$realm"

# The developer's public key, installed by the kernel's tool, which also regenerates, unprinted, the
# secret Keycloak gave the new client by default.
"$kernel/set-client-key.sh" "$realm" "$client" "$jwk"
