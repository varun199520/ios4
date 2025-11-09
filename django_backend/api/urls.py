from django.urls import path
from . import views

urlpatterns = [
    path('', views.api_root, name='api-root'),
    path('health/', views.health_check, name='health-check'),
    path('auth/login/', views.LoginAPIView.as_view(), name='login'),
    path('asset-tags/', views.AssetTagListAPIView.as_view(), name='asset-tags'),
    path('pairs/batch/', views.PairsBatchAPIView.as_view(), name='pairs-batch'),
    path('pairs/search/', views.PairsSearchAPIView.as_view(), name='pairs-search'),
    path('pairs/replace/', views.PairsReplaceAPIView.as_view(), name='pairs-replace'),
]
