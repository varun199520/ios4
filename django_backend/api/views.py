import bcrypt
import jwt
from datetime import datetime, timedelta

from django.conf import settings
from django.db import connection
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import SimpleUser

# Helper: convert cursor results to dicts
def dictfetchall(cursor):
    columns = [col[0] for col in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


class LoginAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        if not username or not password:
            return Response({'error': 'Username and password required'}, status=400)
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM users WHERE username = %s', [username])
            row = cursor.fetchone()
            if not row:
                return Response({'error': 'Invalid credentials'}, status=401)
            stored_hash = row[2]
            if not bcrypt.checkpw(password.encode(), stored_hash.encode()):
                return Response({'error': 'Invalid credentials'}, status=401)
            token = jwt.encode({
                'id': row[0],
                'username': row[1],
                'exp': datetime.utcnow() + timedelta(hours=24)
            }, settings.SIMPLE_JWT['SIGNING_KEY'], algorithm='HS256')
        return Response({'token': token, 'username': username, 'expires_in': 86400})


class APIRoot(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({'message': 'Asset Tracker API (Django)', 'version': '1.0.0'})

api_root = APIRoot.as_view()


class HealthCheck(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({'status': 'ok', 'timestamp': datetime.utcnow().isoformat()})

health_check = HealthCheck.as_view()


class AssetTagListAPIView(APIView):
    def get(self, request):
        since = request.query_params.get('since')
        query = 'SELECT * FROM asset_tags'
        params = []
        if since:
            query += ' WHERE updated_at > %s'
            params.append(since)
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            rows = dictfetchall(cursor)
        asset_tags = [{
            'tag': r['tag'],
            'status': r['status'],
            'last_serial': r['last_serial'],
            'updated_at': r['updated_at'],
        } for r in rows]
        return Response(asset_tags)


class PairsBatchAPIView(APIView):
    def post(self, request):
        pairs = request.data
        if not isinstance(pairs, list):
            return Response({'error': 'Expected array of pairs'}, status=400)
        results = []
        with connection.cursor() as cursor:
            for pair in pairs:
                asset_tag = pair.get('asset_tag')
                serial = pair.get('serial')
                scanned_at = pair.get('scanned_at') or datetime.utcnow().isoformat()
                if not asset_tag or not serial:
                    results.append({'status': 'error', 'message': 'Missing asset_tag or serial'})
                    continue
                cursor.execute('SELECT * FROM asset_tags WHERE tag = %s', [asset_tag])
                asset_row = cursor.fetchone()
                if not asset_row:
                    cursor.execute("INSERT INTO asset_tags (tag, status) VALUES (%s, 'unused')", [asset_tag])
                cursor.execute('SELECT * FROM pairs WHERE asset_tag = %s AND serial = %s', [asset_tag, serial])
                existing_pair = cursor.fetchone()
                status_msg = 'ok_inserted' if existing_pair is None else 'ok_overwrite_same_pair'
                assigned_by = request.user.username if isinstance(request.user, SimpleUser) else 'django'
                cursor.execute('INSERT OR REPLACE INTO pairs (asset_tag, serial, assigned_by, assigned_at) VALUES (%s, %s, %s, %s)', [asset_tag, serial, assigned_by, scanned_at])
                cursor.execute('UPDATE asset_tags SET status = %s, last_serial = %s, updated_at = CURRENT_TIMESTAMP WHERE tag = %s', ['used', serial, asset_tag])
                results.append({'status': status_msg, 'asset_tag': asset_tag, 'serial': serial, 'message': 'Pair saved successfully'})
        return Response(results)


class PairsSearchAPIView(APIView):
    def get(self, request):
        asset_tag = request.query_params.get('asset_tag')
        serial = request.query_params.get('serial')
        if not asset_tag and not serial:
            return Response({'error': 'Either asset_tag or serial required'}, status=400)
        params = []
        query = '''SELECT p.*, at.status as tag_status FROM pairs p LEFT JOIN asset_tags at ON p.asset_tag = at.tag WHERE 1=1'''
        if asset_tag:
            query += ' AND p.asset_tag = %s'
            params.append(asset_tag)
        if serial:
            query += ' AND p.serial = %s'
            params.append(serial)
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            rows = dictfetchall(cursor)
        if not rows:
            return Response({'error': 'No pairs found'}, status=404)
        result = {
            'asset_tag': rows[0]['asset_tag'],
            'serial': rows[0]['serial'],
            'status': rows[0].get('tag_status') or 'unused',
            'history': [{
                'serial': r['serial'],
                'assigned_at': r['assigned_at'],
                'assigned_by': r['assigned_by'],
            } for r in rows]
        }
        return Response(result)


class PairsReplaceAPIView(APIView):
    def put(self, request):
        search_by = request.data.get('searchBy')
        value = request.data.get('value')
        new_asset_tag = request.data.get('new_asset_tag')
        new_serial = request.data.get('new_serial')
        if not search_by or not value or (not new_asset_tag and not new_serial):
            return Response({'success': False, 'message': 'Missing required parameters'}, status=400)
        with connection.cursor() as cursor:
            if search_by == 'asset_tag':
                cursor.execute('SELECT * FROM pairs WHERE asset_tag = %s ORDER BY assigned_at DESC LIMIT 1', [value])
            else:
                cursor.execute('SELECT * FROM pairs WHERE serial = %s ORDER BY assigned_at DESC LIMIT 1', [value])
            existing_pair = cursor.fetchone()
            if not existing_pair:
                return Response({'success': False, 'message': 'No matching pair found'}, status=404)
            update_asset_tag = new_asset_tag or existing_pair[1]
            update_serial = new_serial or existing_pair[2]
            assigned_by = request.user.username if isinstance(request.user, SimpleUser) else 'django'
            cursor.execute('INSERT INTO pairs (asset_tag, serial, assigned_by, assigned_at) VALUES (%s, %s, %s, %s)', [update_asset_tag, update_serial, assigned_by, datetime.utcnow().isoformat()])
            cursor.execute('UPDATE asset_tags SET status = %s, last_serial = %s, updated_at = CURRENT_TIMESTAMP WHERE tag = %s', ['used', update_serial, update_asset_tag])
        return Response({'success': True, 'message': f'Successfully replaced {search_by} {value} with new serial {update_serial}'})
