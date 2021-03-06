from flask import request, jsonify, abort, redirect, url_for
from collections.abc import Iterable
from ipaddress import ip_address, IPv4Address

from ..api import local_api
from ..app import app
from ..permission import Permission, TokenRequest, TokenSet
from ..errors import KiteWrongType, KiteMissingKey, KitePermissionDeniedError

def _validate_one_site_fingerprint(site):
    if site.startswith('SHA256:'):
        try:
            int(site[7:], 16)
            return True
        except ValueError:
            return False

    return False

def _validate_site_fingerprint(site):
    if isinstance(site, Iterable):
        sites = [s for s in site if _validate_one_site_fingerprint(s)]
    else:
        sites = [site]

    if len(sites) == 0:
        raise ValueError("Expected at least one valid site")

    return sites[0]

def _validate_tokens(tokens):
    if not isinstance(tokens, dict):
        raise ValueError("Expected map for tokens")

    ttl_seconds = None
    if 'ttl' in tokens:
        try:
            ttl_seconds = int(tokens['ttl'])
        except (ValueError, TypeError):
            raise KiteWrongType(path=".ttl", expected=KiteWrongType.Number)

    if 'permissions' not in tokens:
        raise KiteMissingKey(path=".", key="permissions")
    if not isinstance(tokens['permissions'], list):
        raise KiteWrongType(path=".permissions", expected=KiteWrongType.List)

    permission = [Permission(p) for p in tokens['permissions']]

    if 'for_site' in tokens:
        site = _validate_site_fingerprint(tokens['for_site'])
    else:
        site = None

    return TokenRequest(permission, ttl=ttl_seconds, site=site)

def _make_tokens(api):
    tokens = request.json
    tokens = _validate_tokens(tokens)

    accept_partial = 'partial' in request.args

    info = api.get_container_info(request.remote_addr)
    if info is None:
        abort(404)

    token = tokens.tokenize(api, persona_id=info.get('persona_id'),
                            site_id=info.get('site_id'))
    if token is None:
        abort(404)

    # Now verify that we have transfer permissions for every permission
    result = token.verify_permissions(api, info, is_transfer=tokens.is_transfer)

    if accept_partial or result.all_accepted:
        return token, result
    else:
        return None, result

@app.route('/tokens', methods=['POST'])
def tokens():
    '''How this works... Post to /tokens with a set of permissions
    and a requested expiry time, in seconds.

    You will either get back a new token, or a 401 authorization
    required with several Link: headers with rel="method"  values.

    The returned token will automatically have a scoping and an
    expiry time set. Thex token will not expire any later than what's
    requested in expiry time, but it may expire sooner. Please check.
    '''
    with local_api() as api:
        token, result = _make_tokens(api)
        if token is None:
            raise KitePermissionDeniedError(result.denied)
        else:
            token_string = token.save(api)

    return jsonify({ 'token': token_string,
                     'expiration': token.expires.isoformat() if token.expires is not None else None })

@app.route('/tokens/preview', methods=['POST'])
def tokens_preview():
    with local_api() as api:
        cur_info = api.get_container_info(request.remote_addr)
        if cur_info is None:
            abort(404)

        token, result = _make_tokens(api)
        if token is None:
            raise KitePermissionDeniedError(result.denied)
        else:
            description = token.describe(api, cur_info.get('persona_id'))
            return jsonify(description.to_json())

@app.route('/<addr>/permissions')
def permissions(addr):
    if addr == 'me':
        addr = request.remote_addr

    try:
        if not isinstance(ip_address(addr), IPv4Address):
            abort(404)
    except ValueError:
        abort(404)

    with local_api() as api:
        info = api.get_container_info(addr)
        if info is None:
            abort(404)

        tokens = TokenSet(api, info.get('tokens',[]))
        return jsonify([p.canonical for p in tokens.all_permissions])

@app.route('/login', methods=['POST'])
def do_login():
    if request.content_length > (16 * 1024):
        return 'Payload too large', 413

    with local_api() as api:
        info = api.get_container_info(request.remote_addr)
        if info is None:
            abort(404)

        if not info.get('logged_in', False):
            pw = request.get_data().decode('ascii')

            res = api.update_container(request.remote_addr, credential='pwd:{}'.format(pw))

            if res.not_found:
                abort(404)
            elif res.internal_error:
                abort(500)
            elif res.not_allowed:
                abort(401)

    return redirect(url_for('me', _scheme='kite+app', _external=True), code=303)
