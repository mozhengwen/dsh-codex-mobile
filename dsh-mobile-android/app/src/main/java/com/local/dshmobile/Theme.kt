package com.local.dshmobile

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import android.app.Activity
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/*
 * Values mirror DSH's own dark theme (ui-theme token map):
 * base #151517, layer-1 #232324, layer-2 #2c2c2e, text #f5f6f7,
 * white primary action, blue business accent #7aaaff.
 */
private val DshDarkColors = darkColorScheme(
    primary = Color(0xFFF5F6F7),
    onPrimary = Color(0xFF0F1115),
    primaryContainer = Color(0xFF2C2C2E),
    onPrimaryContainer = Color(0xFFF5F6F7),
    secondary = Color(0xFF7AAAFF),
    onSecondary = Color(0xFF071326),
    secondaryContainer = Color(0xFF2A3448),
    onSecondaryContainer = Color(0xFFD3E2FF),
    tertiary = Color(0xFFF7AD31),
    onTertiary = Color(0xFF2A1B00),
    background = Color(0xFF151517),
    onBackground = Color(0xFFF9FAFB),
    surface = Color(0xFF232324),
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color(0xFF151517),
    surfaceContainerLow = Color(0xFF1C1C1E),
    surfaceContainer = Color(0xFF232324),
    surfaceContainerHigh = Color(0xFF29292B),
    surfaceContainerHighest = Color(0xFF2C2C2E),
    onSurface = Color(0xFFF9FAFB),
    surfaceVariant = Color(0xFF2C2C2E),
    onSurfaceVariant = Color(0xFFCFD3D6),
    outline = Color(0x33FFFFFF),
    outlineVariant = Color(0x1FFFFFFF),
    error = Color(0xFFF25A5A),
    onError = Color(0xFF2A0505),
    errorContainer = Color(0xFF3A1D1D),
    onErrorContainer = Color(0xFFFFD4D4),
)

// Desktop ui-theme design_platform.css: neutral controls, white canvas,
// deepseek-50 user bubble, subtle borders, business-blue used for status.
private val DshLightColors = lightColorScheme(
    primary = Color(0xFF0F1115), onPrimary = Color.White,
    primaryContainer = Color(0xFFEDF3FE), onPrimaryContainer = Color(0xFF0F1115),
    secondary = Color(0xFF4176E6), onSecondary = Color.White,
    secondaryContainer = Color(0xFFE4EDFD), onSecondaryContainer = Color(0xFF34415B),
    tertiary = Color(0xFF986000), onTertiary = Color.White,
    background = Color.White, onBackground = Color(0xFF0F1115),
    surface = Color(0xFFF9FAFB), onSurface = Color(0xFF0F1115),
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFF9FAFB),
    surfaceContainer = Color(0xFFF9FAFB),
    surfaceContainerHigh = Color(0xFFF1F3F5),
    surfaceContainerHighest = Color(0xFFEAEEF0),
    surfaceVariant = Color(0xFFF1F3F5), onSurfaceVariant = Color(0xFF61666B),
    outline = Color(0x1A000000), outlineVariant = Color(0x0A000000),
    error = Color(0xFFEC1313), onError = Color.White,
    errorContainer = Color(0xFFFEF2F2), onErrorContainer = Color(0xFF570C0C),
)

@Composable
fun DshMobileTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val view = LocalView.current
    SideEffect {
        val activity = view.context as? Activity
        if (activity != null) {
            val bars = WindowCompat.getInsetsController(activity.window, view)
            bars.isAppearanceLightStatusBars = !darkTheme
            bars.isAppearanceLightNavigationBars = !darkTheme
        }
    }
    val defaults = Typography()
    MaterialTheme(
        colorScheme = if (darkTheme) DshDarkColors else DshLightColors,
        shapes = Shapes(
            extraSmall = RoundedCornerShape(4.dp), small = RoundedCornerShape(8.dp),
            medium = RoundedCornerShape(12.dp), large = RoundedCornerShape(16.dp),
            extraLarge = RoundedCornerShape(20.dp),
        ),
        typography = defaults.copy(
            bodyLarge = defaults.bodyLarge.copy(fontSize = 15.sp, lineHeight = 24.sp),
            bodyMedium = defaults.bodyMedium.copy(fontSize = 14.sp, lineHeight = 22.sp),
            bodySmall = defaults.bodySmall.copy(fontSize = 12.sp, lineHeight = 18.sp),
        ),
        content = content,
    )
}
