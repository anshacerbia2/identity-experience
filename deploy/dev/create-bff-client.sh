#!/usr/bin/env bash
# Registers identity-experience-bff in the development kernel, and prints its secret once as an
# .env line. Run once, on the server, by whoever operates it:
#
#   ./create-bff-client.sh /path/to/identity-control/deploy/dev/.env
#
# The argument is the file that already holds the kernel's Keycloak container name and bootstrap
# administrator (KERNEL_KEYCLOAK_CONTAINER, KC_BOOTSTRAP_ADMIN_USERNAME, KC_BOOTSTRAP_ADMIN_PASSWORD),
# so no password is typed on a command line or copied into a second file.
#
#   identity-experience-bff  the BFF's confidential client (TDD-identity-experience-001).
#                            Authorization Code with PKCE S256 and nothing else: no password grant,
#                            no implicit flow, no service account (STD-IAM-001 §3.2). The kernel's
#                            scnehaux-provider scope attached and identity-control named in aud, so
#                            its access tokens are what the Identity Control API accepts
#                            (STD-IAM-002 §3.1.1). PS256 for the ID token as well as the access
#                            token, because the BFF accepts no other algorithm. A 240-second access
#                            token: provider-scope is lifetime class L0 (§3.3).
#
# The redirect URI is the BFF running on a developer's machine, http://127.0.0.1:8090. Not
# localhost:8080: the dev tunnel forwards the server's port 8080 and rewrites any redirect to
# localhost:8080 into the tunnel's own URL, which sent the first real sign-in back to Keycloak
# instead of the BFF. A port the tunnel does not forward is left alone. Keycloak
# cannot reach that machine, so no back-channel logout URL is registered; a session removed in the
# kernel still ends the BFF session at its next refresh, within four minutes.
#
# It creates this one client and changes nothing else: no realm setting, no scope, no other client.
# It refuses when the client exists, because a secret cannot be read back and a second run would
# have to replace the one a developer holds. identity-control's create-kernel-clients.sh and
# dev-keycloak.ps1 are never run for this.
#
# Not yet a registration. identity-control registers public and resource clients through its API;
# confidential registration needs credential issuance, which is not built. Until it is, this client
# is created here, as identity-control's own clients were, and ROADMAP.md records that it must be
# registered before unmanaged clients start being disabled.
set -euo pipefail

if [ "$#" -ne 1 ] || [ ! -r "$1" ]; then
	echo "usage: $0 /path/to/identity-control/deploy/dev/.env" >&2
	exit 2
fi

set -a
# shellcheck disable=SC1090
. "$1"
set +a

container="${KERNEL_KEYCLOAK_CONTAINER:-scnehaux-identity-dev-keycloak-1}"
realm=scnehaux
client=identity-experience-bff
redirect_uri=http://127.0.0.1:8090/auth/callback
random() { od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; }

kc() {
	docker exec -i "$container" /opt/keycloak/bin/kcadm.sh "$@" --config /tmp/kcadm-identity-experience-bff.config
}

kc config credentials --server http://localhost:8080 --realm master \
	--user "${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null

if [ -n "$(kc get clients -r "$realm" -q "clientId=$client" --fields id --format csv --noquotes | head -n 1)" ]; then
	echo "create-bff-client: $client already exists in realm $realm; nothing created." >&2
	echo "Its secret cannot be read back here. Regenerate it in the Admin Console if it was lost." >&2
	exit 1
fi

scope="$(kc get client-scopes -r "$realm" --fields id,name --format csv --noquotes | grep ',scnehaux-provider$' | cut -d, -f1 || true)"
if [ -z "$scope" ]; then
	echo "create-bff-client: realm $realm has no scnehaux-provider scope. Apply identity-kernel's realm" >&2
	echo "definition first (realm-apply), which declares it." >&2
	exit 1
fi

secret="$(random)"
uuid="$(kc create clients -r "$realm" -i \
	-s clientId="$client" -s enabled=true -s publicClient=false \
	-s serviceAccountsEnabled=false -s standardFlowEnabled=true \
	-s directAccessGrantsEnabled=false -s implicitFlowEnabled=false \
	-s frontchannelLogout=false \
	-s "redirectUris=[\"$redirect_uri\"]" -s 'webOrigins=[]' \
	-s 'attributes."pkce.code.challenge.method"=S256' \
	-s 'attributes."access.token.signed.response.alg"=PS256' \
	-s 'attributes."id.token.signed.response.alg"=PS256' \
	-s 'attributes."access.token.lifespan"=240' \
	-s "secret=$secret")"
# The audience belongs to the client relationship, not to the claim profile, as on
# identity-control-caller: the provider scope does not make every provider token valid at every API.
kc create "clients/$uuid/protocol-mappers/models" -r "$realm" \
	-s name=identity-control-audience -s protocol=openid-connect -s protocolMapper=oidc-audience-mapper \
	-s 'config."included.client.audience"=identity-control' \
	-s 'config."access.token.claim"=true' -s 'config."id.token.claim"=false' \
	-s 'config."introspection.token.claim"=true' >/dev/null
kc update "clients/$uuid/default-client-scopes/$scope" -r "$realm"

echo "IDENTITY_EXPERIENCE_CLIENT_SECRET=$secret"
