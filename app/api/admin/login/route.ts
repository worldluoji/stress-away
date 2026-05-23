import { NextRequest, NextResponse } from 'next/server';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_ALLOWED_DEVICES = (process.env.ADMIN_ALLOWED_DEVICES || '').split(',').filter(Boolean);
const ADMIN_REQUIRE_DEVICE_CHECK = process.env.ADMIN_REQUIRE_DEVICE_CHECK !== 'false';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;
    const deviceId = request.headers.get('x-device-id') || body.deviceId;

    if (!ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: 'Admin not configured' },
        { status: 500 }
      );
    }

    if (password !== ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Device check if required and allowed devices list is configured
    if (ADMIN_REQUIRE_DEVICE_CHECK && ADMIN_ALLOWED_DEVICES.length > 0) {
      if (!deviceId) {
        return NextResponse.json(
          { error: 'Device ID required for admin login' },
          { status: 400 }
        );
      }

      if (!ADMIN_ALLOWED_DEVICES.includes(deviceId)) {
        return NextResponse.json(
          { error: 'Device not authorized' },
          { status: 403 }
        );
      }
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set('admin_token', ADMIN_PASSWORD, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 2, // 2 hours
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}