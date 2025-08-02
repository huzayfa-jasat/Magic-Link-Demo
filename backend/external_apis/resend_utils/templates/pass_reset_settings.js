// Constant Imports
const {
	LOGO_URL,
} = require('../constants');

// Password Reset from Settings Template
const resend_template_PasswordResetFromSettings = (resetLink) => {
	return (`
		<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
		<html dir="ltr" lang="en">
			<head>
				<link rel="preload" as="image" href="${LOGO_URL}" />
				<meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
				<meta name="x-apple-disable-message-reformatting" />
			</head>
			<body style='background-color:rgb(245,245,245);font-family:ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";padding-top:40px;padding-bottom:40px'>
				<!--$-->
				<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0">
					Reset your OmniVerifier password
				</div>
				<table
					align="center"
					width="100%"
					border="0"
					cellpadding="0"
					cellspacing="0"
					role="presentation"
					style="max-width:600px;margin-left:auto;margin-right:auto"
				>
				<tbody>
					<tr style="width:100%">
						<td>
							<table
								align="center"
								width="100%"
								border="0"
								cellpadding="0"
								cellspacing="0"
								role="presentation"
								style="border-width:1px;border-style:solid;border-color:rgb(221,221,221);border-radius:5px;overflow:hidden;background-color:rgb(255,255,255)"
							>
								<tbody>
									<tr>
										<td>
											<table
												align="center"
												width="100%"
												border="0"
												cellpadding="0"
												cellspacing="0"
												role="presentation"
												style="padding-left:32px;padding-right:32px;padding-top:32px;padding-bottom:20px;text-align:center;background-color:rgb(110,207,255)"
											>
												<tbody>
													<tr>
														<td>
															<img
																alt="OmniVerifier Logo"
																height="80"
																src="${LOGO_URL}"
																style="width:80px;height:auto;object-fit:cover;margin-left:auto;margin-right:auto;display:block;outline:none;border:none;text-decoration:none"
																width="80"
															/>
														</td>
													</tr>
												</tbody>
											</table>
											<table
												align="center"
												width="100%"
												border="0"
												cellpadding="0"
												cellspacing="0"
												role="presentation"
												style="padding-left:32px;padding-right:32px;padding-bottom:16px"
											>
												<tbody>
													<tr>
														<td>
															<h1 style="font-size:24px;font-weight:700;color:rgb(0,0,0);text-align:center;margin:0px;margin-bottom:16px">
																Reset Your Password
															</h1>
															<p style="font-size:16px;line-height:24px;color:rgb(0,0,0);margin-bottom:24px;margin-top:16px">
																You requested to reset your OmniVerifier account password. Click the button below to create a new password.
															</p>
															<table
																align="center"
																width="100%"
																border="0"
																cellpadding="0"
																cellspacing="0"
																role="presentation"
																style="margin-bottom:32px;text-align:center"
															>
																<tbody>
																	<tr>
																		<td>
																			<a
																				href="${resetLink}"
																				style="background-color:rgb(110,207,255);border-radius:4px;color:rgb(0,0,0);font-weight:700;font-size:16px;padding-left:24px;padding-right:24px;padding-top:12px;padding-bottom:12px;text-decoration-line:none;text-align:center;display:inline-block;box-sizing:border-box;line-height:100%;text-decoration:none;max-width:100%;mso-padding-alt:0px;padding:12px 24px 12px 24px"
																				target="_blank"
																			>
																				<span>
																					<!--[if mso]>
																					<i style="mso-font-width:400%;mso-text-raise:18" hidden>&#8202;&#8202;&#8202;</i>
																					<![endif]-->
																				</span>
																				<span style="max-width:100%;display:inline-block;line-height:120%;mso-padding-alt:0px;mso-text-raise:9px">
																					Reset Password
																				</span>
																				<span>
																					<!--[if mso]>
																					<i style="mso-font-width:400%" hidden>&#8202;&#8202;&#8202;&#8203;</i>
																					<![endif]-->
																				</span>
																			</a>
																		</td>
																	</tr>
																</tbody>
															</table>
															<p style="font-size:16px;line-height:24px;color:rgb(0,0,0);margin-bottom:24px;margin-top:16px">
																This password reset link will expire in 10 minutes for security purposes.
															</p>
															<p style="font-size:16px;line-height:24px;color:rgb(0,0,0);margin-bottom:24px;margin-top:16px">
																If you didn&#x27;t request a password reset, please contact our support team immediately as someone else may be trying to access your account.
															</p>
															<p style="font-size:16px;line-height:24px;color:rgb(0,0,0);margin-bottom:24px;margin-top:16px">
																If you continue to have problems, please contact our support team for assistance.
															</p>
														</td>
													</tr>
												</tbody>
											</table>
											<table
												align="center"
												width="100%"
												border="0"
												cellpadding="0"
												cellspacing="0"
												role="presentation"
												style="padding-left:32px;padding-right:32px;padding-top:20px;padding-bottom:20px;background-color:rgb(110,207,255);border-top-width:1px;border-style:solid;border-color:rgb(221,221,221)"
											>
												<tbody>
													<tr>
														<td>
															<p style="font-size:14px;line-height:20px;color:rgb(0,0,0);text-align:center;margin:0px;margin-bottom:0px;margin-top:0px;margin-left:0px;margin-right:0px">
																This is an automated message from OmniVerifier. Please do not reply to this email.
															</p>
														</td>
													</tr>
												</tbody>
											</table>
										</td>
									</tr>
								</tbody>
							</table>
							<table
								align="center"
								width="100%"
								border="0"
								cellpadding="0"
								cellspacing="0"
								role="presentation"
								style="margin-top:32px;text-align:center"
							>
								<tbody>
									<tr>
										<td>
											<p style="font-size:14px;line-height:24px;color:rgb(0,0,0);margin:0px;margin-bottom:0px;margin-top:0px;margin-left:0px;margin-right:0px">
												© OmniVerifier. All Rights Reserved.
											</p>
										</td>
									</tr>
								</tbody>
							</table>
						</td>
					</tr>
				</tbody>
				</table>
				<!--7--><!--/$-->
			</body>
		</html>
	`)
}
	
module.exports = resend_template_PasswordResetFromSettings;