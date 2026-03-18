/**
 * Facebook Login helpers.
 * NOTE: process.env values are read inside each function (not at module top)
 * to avoid ESM import-order issues with dotenv.
 */

import axios from 'axios'

const GQL = 'https://graph.facebook.com/v19.0'

/**
 * Exchange OAuth code for a short-lived user access token.
 */
export async function exchangeCodeForToken(code) {
  const { data } = await axios.get(`${GQL}/oauth/access_token`, {
    params: {
      client_id:     process.env.FACEBOOK_APP_ID,
      client_secret: process.env.FACEBOOK_APP_SECRET,
      redirect_uri:  process.env.FACEBOOK_REDIRECT_URI,
      code,
    },
  })
  return data
}

/**
 * Extend a short-lived token to a long-lived token (~60 days).
 */
export async function getLongLivedToken(shortToken) {
  const { data } = await axios.get(`${GQL}/oauth/access_token`, {
    params: {
      grant_type:      'fb_exchange_token',
      client_id:       process.env.FACEBOOK_APP_ID,
      client_secret:   process.env.FACEBOOK_APP_SECRET,
      fb_exchange_token: shortToken,
    },
  })
  return data
}

/**
 * Fetch the authenticated user's public profile.
 * Returns { id, name, picture: { data: { url } } }
 */
export async function fetchUserProfile(accessToken) {
  const { data } = await axios.get(`${GQL}/me`, {
    params: {
      fields:       'id,name,picture.width(200).height(200)',
      access_token: accessToken,
    },
  })
  return data
}
